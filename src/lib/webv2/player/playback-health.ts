/** A conservative media-progress assessment shared by the player and tests.
 * A "waiting"/"stalled" event alone does not prove buffering persists:
 * some Android implementations continue advancing the playhead afterward.
 */
export interface MediaObservation {
  currentTime: number;
  paused: boolean;
  seeking: boolean;
  ended: boolean;
  readyState: number;
  /** Background tabs are not evidence of a dead source: timers are throttled. */
  pageHidden?: boolean;
}
export interface MediaProgressHistory {
  previousTime: number;
  lastAdvancedAt: number;
  waitingSince: number | null;
}
export interface MediaAssessment {
  advanced: boolean;
  showBuffer: boolean;
  failOver: boolean;
}

export function assessMediaProgress(
  media: MediaObservation,
  history: MediaProgressHistory,
  now: number,
): MediaAssessment {
  const active = !media.pageHidden && !media.paused && !media.seeking && !media.ended;
  const advanced = active && Number.isFinite(media.currentTime) &&
    Number.isFinite(history.previousTime) &&
    media.currentTime - history.previousTime >= 0.15;
  const duration = history.waitingSince === null ? 0 :
    Math.max(0, now - Math.max(history.waitingSince, history.lastAdvancedAt));
  // readyState HAVE_CURRENT_DATA/HAVE_METADATA can indicate a real stall,
  // but only AFTER the playhead has failed to advance for an interval.
  const showBuffer = active && !advanced && history.waitingSince !== null &&
    media.readyState < 3 && duration >= 1000;
  return { advanced, showBuffer, failOver: showBuffer && duration >= 22000 };
}


/** Count only forward playback actually observed by media timeupdate.
 * A restore/seek jump from 0:00 to 12:35 is not proof that the source played. */
export function observedForwardPlayback(
  previous: number | null, current: number, paused: boolean, seeking: boolean,
): number {
  if (paused || seeking || previous === null ||
    !Number.isFinite(previous) || !Number.isFinite(current)) return 0;
  const delta = current - previous;
  return delta >= 0.02 && delta <= 5 ? delta : 0;
}

/** Watch the first playable frame even when a mobile engine never emits
 * waiting/stalled/error. The caller starts and resets startedAt only while
 * foregrounded; Date.now() elapsed in a hidden tab is not a source failure. */
export function assessInitialSourceLoad(input: {
  startedAt: number;
  now: number;
  readyState: number;
  pageHidden: boolean;
}): { ready: boolean; slow: boolean; failOver: boolean } {
  const ready = input.readyState >= 3;
  const active = !input.pageHidden &&
    Number.isFinite(input.startedAt) && input.startedAt > 0 &&
    Number.isFinite(input.now) && input.now >= input.startedAt && !ready;
  const elapsed = active ? input.now - input.startedAt : 0;
  return {
    ready,
    slow: active && elapsed >= 8000,
    failOver: active && elapsed >= 26000,
  };
}
