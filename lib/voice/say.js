// Speak a command out loud from a pre-recorded clip (public/voice/<slug>.mp3).
// Played through the game's WebAudio context like the sound effects:
// speechSynthesis takes over the audio session on iOS and the mic stops.
const clips = new Map();
const slug = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '-');

export function say(text, ctx) {
  if (!ctx) return;
  const key = slug(text);
  if (!clips.has(key)) {
    clips.set(key, fetch(`../../voice/${key}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((data) => new Promise((ok, fail) => ctx.decodeAudioData(data, ok, fail))));
  }
  clips.get(key).then((buf) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  }).catch(() => {});
}
