/* Grupos: objetos que se seleccionan y mueven juntos (por ejemplo, un rectángulo con sus cotas) */
import { app } from '../core/app';

export const newGroupId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* Agrega a la lista todos los objetos que comparten grupo con alguno de ella */
export function expandGroups(list: any[]) {
  const ids = new Set(list.map(e => e.group).filter(Boolean));
  if (!ids.size) return list;
  const out = new Set(list);
  for (const e of app.model.entities) if (e.group && ids.has(e.group)) out.add(e);
  return [...out];
}

/* Las copias tienen que formar un grupo nuevo, separado del original */
export function regroup(list: any[]) {
  const map = new Map<string, string>();
  for (const e of list) if (e.group) { if (!map.has(e.group)) map.set(e.group, newGroupId()); e.group = map.get(e.group); }
  return list;
}
