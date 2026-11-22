// Speak a command out loud (pt-BR), so the child hears how to say it.
export function say(text) {
  const s = window.speechSynthesis;
  if (!s) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR';
  u.rate = 0.9;
  s.speak(u);
}
