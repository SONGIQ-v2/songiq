// navigator.vibrate() only exists on Android browsers -- iOS Safari (including
// installed PWAs) has never implemented the Vibration API, so every call here
// silently no-ops there instead of throwing.
const supported = typeof navigator !== "undefined" && "vibrate" in navigator;

/** A new round/turn has begun. */
export function vibrateRoundStart() {
  if (supported) navigator.vibrate(40);
}

/** The player's answer was graded correct. */
export function vibrateCorrect() {
  if (supported) navigator.vibrate([40, 60, 40]);
}

/** The player's answer was graded incorrect, or time ran out. */
export function vibrateIncorrect() {
  if (supported) navigator.vibrate(150);
}
