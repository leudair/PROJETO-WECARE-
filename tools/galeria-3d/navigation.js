export const initialNavigation = () => ({
  mode: 'gallery', selected: 0, route: 0, intro: true, webgl: null,
});

const limit = (i, last) => Math.max(0, Math.min(i, last));

export function selectObject(state, i, last) {
  return { ...state, selected: limit(i, last) };
}

export function exhibitionView(state, i, last) {
  if (state.webgl !== true) return selectObject(state, i, last);
  const selected = limit(i, last);
  const intro = i < 0;
  const route = Math.max(0, Math.min(i + 1, last + 2));
  return { ...state, mode: 'gallery', selected, intro, route };
}

export function nextStation(state, direction, last) {
  if (state.mode !== 'gallery' || state.webgl !== true) return null;
  const next = Math.max(0, Math.min(last + 2, state.route + direction));
  return next === state.route ? null : next - 1;
}
