#!/usr/bin/env bash
# te-hook.sh — Hermes -> Tiny Engineer. Installed by scripts/install.mjs into
# <hermes profile>/agent-hooks/ (as te-hook.sh on a new machine, or as
# bell-robot.sh when that path is already allowlisted) and wired to 7 lifecycle
# events in that profile's config.yaml. See adapters/hermes.md.
#
# v3: same behaviour as v2, but builtins only (no date/sed/cat/wc forks) so a hook
#     costs ~1 bash start + 1 curl instead of ~800 ms. Every pre_tool_call pays this.
#
# Behaviour
#   - kill switch   touch .te-hook-off   (--off / --on / --status)
#   - quiet grace   a `ring` mutes continuous poses for TE_QUIET_SECS (20 s) so the
#                   bell is the last thing you see; on_session_end always rings,
#                   and the window self-heals if Hermes stops emitting pre_llm_call
#   - 1 s gate      never posts twice inside the firmware's 1 s minimum hold
#   - config        TINY_ENGINEER_URL/TOKEN env > %APPDATA%\tiny-engineer\env > IP
#                   (no *.local: mDNS dies behind Clash/TUN and on guest WiFi)
#   - log           bell-hook.log, rotated to .1 at 256 KB (checked on session start)
#
# Event map (docs/api.md in the tiny-engineer repo describes each pose)
#   on_session_start        -> welcome
#   pre_llm_call            -> thinking
#   pre_tool_call           -> reading (read/search tools) else typing
#   pre_approval_request    -> attention
#   post_approval_response  -> abort when denied
#   on_session_end          -> ring / error / abort
#   agent_loop_stopped      -> abort
#
# Env: TINY_ENGINEER_URL, TINY_ENGINEER_TOKEN, BELL_HOOK_LOG, TE_QUIET_SECS,
#      TE_OFF_FILE, TINY_ENGINEER_ENV_FILE

set -u

SELF="${BASH_SOURCE[0]:-$0}"
case "$SELF" in
  */*) HERE="${SELF%/*}" ;;
  *)   HERE="." ;;
esac

LOG="${BELL_HOOK_LOG:-$HERE/bell-hook.log}"
OFF_FILE="${TE_OFF_FILE:-$HERE/.te-hook-off}"
STATE="$HERE/.te-state"
RING_AT="$STATE/last-ring-ms"
POST_AT="$STATE/last-post-ms"
QUIET="$STATE/quiet"
QUIET_SECS="${TE_QUIET_SECS:-20}"   # short grace after a bell; a new turn or the next
                                    # ring clears it, and it self-heals at this cap
DEFAULT_URL="http://192.168.70.196"

[ -d "$STATE" ] || mkdir -p "$STATE" 2>/dev/null

now_ms() {
  local t="${EPOCHREALTIME:-}"
  if [ -n "$t" ]; then
    t="${t//[!0-9]/}"          # 1759999999123456 -> drop the decimal separator
    printf '%s' "${t:0:13}"
  else
    printf '%s' "$(( $(date +%s 2>/dev/null || echo 0) * 1000 ))"
  fi
}

logline() { # <event> <anim|skip:reason> <tool> <http>
  local ts
  printf -v ts '%(%Y-%m-%d %H:%M:%S)T' -1 2>/dev/null || ts="$(date '+%Y-%m-%d %H:%M:%S' 2>/dev/null)"
  printf '%s\t%-22s\t%-11s\ttool=%-16s\thttp=%s\n' \
    "${ts:--}" "${1:--}" "${2:--}" "${3:--}" "${4:--}" >> "$LOG" 2>/dev/null
}

cfg_file() {
  if [ -n "${TINY_ENGINEER_ENV_FILE:-}" ]; then printf '%s' "$TINY_ENGINEER_ENV_FILE"; return; fi
  local a="${APPDATA:-$HOME/AppData/Roaming}"
  a="${a//\\//}"
  printf '%s/tiny-engineer/env' "$a"
}

cfg_get() { # cfg_get KEY  (one fork for sed only when the file exists)
  local f; f="$(cfg_file)"
  [ -f "$f" ] || return 0
  while IFS='=' read -r k v; do
    [ "$k" = "$1" ] && { printf '%s' "${v%$'\r'}"; return 0; }
  done < "$f"
}

resolve() { # resolve ENVNAME CFGKEY DEFAULT
  local v="${!1:-}"
  [ -z "$v" ] && v="$(cfg_get "$2")"
  [ -z "$v" ] && v="$3"
  printf '%s' "$v"
}

ROBOT="$(resolve TINY_ENGINEER_URL TINY_ENGINEER_URL "$DEFAULT_URL")"
ROBOT="${ROBOT%/}"
TOKEN="$(resolve TINY_ENGINEER_TOKEN TINY_ENGINEER_TOKEN '')"

post() { # post <anim> -> http code
  local url="${ROBOT}/anim?name=$1" code
  if [ -n "$TOKEN" ]; then
    code=$(curl -s --noproxy '*' -m 3 -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" "$url")
  else
    code=$(curl -s --noproxy '*' -m 3 -o /dev/null -w '%{http_code}' -X POST "$url")
  fi
  printf '%s' "${code:-000}"
}

# ---------------------------------------------------------------- modes

case "${1:-}" in
  --status)
    printf 'url:         %s\n' "$ROBOT"
    if [ -n "$TOKEN" ]; then printf 'token:       set\n'; else printf 'token:       none\n'; fi
    if [ -f "$OFF_FILE" ]; then printf 'kill switch: OFF (%s)\n' "$OFF_FILE"; else printf 'kill switch: armed (on)\n'; fi
    printf 'quiet:       %ss grace after ring\n' "$QUIET_SECS"
    if [ -f "$QUIET" ]; then printf 'quiet now:   YES (ringed %ss ago)\n' "$(( ( $(now_ms) - $(<"$QUIET") ) / 1000 ))"; fi
    if [ -f "$RING_AT" ]; then
      printf 'last ring:   %ss ago\n' "$(( ( $(now_ms) - $(<"$RING_AT") ) / 1000 ))"
    fi
    printf 'log:         %s\n' "$LOG"
    exit 0 ;;
  --on)  rm -f "$OFF_FILE"; printf 'robot hooks: ON\n'; exit 0 ;;
  --off) : > "$OFF_FILE";   printf 'robot hooks: OFF\n'; exit 0 ;;
  --test)
    if [ -f "$OFF_FILE" ]; then printf 'hooks are OFF; run --on first\n'; exit 1; fi
    code="$(post ring)"; logline "--test" ring "-" "$code"
    printf 'POST %s/anim?name=ring -> http=%s\n' "$ROBOT" "$code"
    exit 0 ;;
esac

# ---------------------------------------------------------------- hook mode

[ -f "$OFF_FILE" ] && exit 0

payload=""
IFS= read -r -d '' payload 2>/dev/null || true

jget() { # jget KEY -> first string value
  local re="\"$1\"[[:space:]]*:[[:space:]]*\"([^\"]*)\""
  [[ $payload =~ $re ]] && printf '%s' "${BASH_REMATCH[1]}"
}

event="$(jget hook_event_name)"
tool="$(jget tool_name)"
anim=""

case "$event" in
  on_session_start) anim="welcome" ;;
  pre_llm_call)     anim="thinking" ;;
  pre_tool_call)
    case "$tool" in
      read_file|search_files|web_search|web_extract|browser_exec|vision_analyze|skill_view|todo_list|session_search)
        anim="reading" ;;
      *) anim="typing" ;;
    esac ;;
  pre_approval_request) anim="attention" ;;
  post_approval_response)
    case "$payload" in *deny*|*Deny*) anim="abort" ;; *) anim="" ;; esac ;;
  agent_loop_stopped) anim="abort" ;;
  on_session_end)
    case "$payload" in
      *'"interrupted": true'*|*'"interrupted":true'*) anim="abort" ;;
      *'"failed": true'*|*'"failed":true'*)           anim="error" ;;
      *'"completed": false'*|*'"completed":false'*)   anim="" ;;
      *)                                              anim="ring" ;;
    esac ;;
esac

[ -z "$anim" ] && exit 0

# rotate the log once per session instead of on every event
if [ "$event" = "on_session_start" ] && [ -f "$LOG" ] && [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt 262144 ]; then
  mv -f "$LOG" "$LOG.1" 2>/dev/null
fi

t="$(now_ms)"

# A new turn clears the quiet flag: pre_llm_call = the user just said something,
# on_session_start = a fresh session. Everything else stays silent after a bell.
case "$event" in
  pre_llm_call|on_session_start) rm -f "$QUIET" ;;
esac

# Quiet grace after a bell.
# A fixed window, not "until the next turn": some Hermes builds stop emitting
# pre_llm_call mid-session, and then the flag never cleared — the robot went
# silent for the rest of the task, bell included. The cap self-heals.
# on_session_end always passes: a bell is exactly what the quiet window protects.
if [ -f "$QUIET" ] && [ "$event" != "pre_llm_call" ] && [ "$event" != "on_session_start" ] && [ "$event" != "on_session_end" ]; then
  q="$(<"$QUIET")"
  case "$q" in ''|*[!0-9]*) q=0 ;; esac
  if [ $(( t - q )) -lt $(( QUIET_SECS * 1000 )) ]; then
    logline "$event" "skip:quiet-turn" "$tool" "-"; exit 0
  fi
fi

if [ -f "$POST_AT" ]; then
  last="$(<"$POST_AT")"
  case "$last" in ''|*[!0-9]*) last=0 ;; esac
  if [ $(( t - last )) -lt 900 ]; then
    logline "$event" "skip:hold" "$tool" "-"; exit 0
  fi
fi

code="$(post "$anim")"
printf '%s' "$t" > "$POST_AT"
if [ "$anim" = "ring" ]; then
  printf '%s' "$t" > "$RING_AT"
  printf '%s' "$t" > "$QUIET"
fi

logline "$event" "$anim" "$tool" "$code"
exit 0
