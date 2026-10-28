/* Ventanita para editar un texto (se abre con doble clic sobre el texto) */
import { $ } from '../core/dom';
import { dirtyCache } from '../model/bounds';
import { cleanMText } from '../model/text';
import { edit } from '../model/undo';
import { requestDraw } from '../render/draw';
import { log } from './commandline';

let multiline = false;
export function editTextDialog(initial: string, multi: boolean): Promise<string | null> {
  const dlg: HTMLDialogElement = $('textDialog'), ta: HTMLTextAreaElement = $('textDialogInput');
  multiline = multi;
  ta.value = initial; ta.rows = multi ? 4 : 1;
  $('textDialogHint').textContent = multi ? 'Enter agrega un renglón. Ctrl+Enter acepta.' : 'Enter acepta. Esc cancela.';
  return new Promise(res => {
    const onClose = () => { dlg.removeEventListener('close', onClose); res(dlg.returnValue === 'ok' ? ta.value : null); };
    dlg.addEventListener('close', onClose);
    dlg.returnValue = '';
    dlg.showModal(); ta.focus(); ta.select();
  });
}
export function initTextDialog() {
  const dlg: HTMLDialogElement = $('textDialog'), ta: HTMLTextAreaElement = $('textDialogInput');
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (!multiline || e.ctrlKey)) { e.preventDefault(); dlg.close('ok'); }
  });
}

export async function editTextEntity(e) {
  if (e.type === 'TEXT') {
    const v = await editTextDialog(String(e.text ?? ''), false);
    if (v === null || v === e.text) return;
    edit(() => { e.text = v.replace(/\r?\n/g, ' '); dirtyCache(e); });
  } else if (e.type === 'MTEXT') {
    const v = await editTextDialog(cleanMText(e.text), true);
    if (v === null) return;
    edit(() => { e.text = v.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\P'); dirtyCache(e); });
  } else return;
  requestDraw();
  log('Texto modificado.', 'res');
}
