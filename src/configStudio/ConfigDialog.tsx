import { useEffect, useRef, type ReactNode } from 'react';
import BlockingFullscreenModal from '../components/Common/BlockingFullscreenModal';

/** Shared app modal with focus isolation, including keyboard-only users. */
export function ConfigDialog({open,title,children,onClose,busy=false}:{open:boolean;title:string;children:ReactNode;onClose?:()=>void;busy?:boolean}) {
  const content=useRef<HTMLDivElement>(null);
  const actions=useRef({onClose,busy});actions.current={onClose,busy};
  useEffect(()=>{
    if(!open||!content.current)return;
    const root=content.current,previous=document.activeElement as HTMLElement|null;
    const blocked=[...document.body.children].filter((element):element is HTMLElement=>element instanceof HTMLElement&&!element.contains(root)).map(element=>({element,inert:element.inert}));
    for(const entry of blocked)entry.element.inert=true;
    const focusables=()=>[...root.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')].filter(element=>!element.hasAttribute('disabled')&&element.tabIndex>=0&&element.getClientRects().length);
    (focusables()[0]??root).focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!actions.current.busy&&actions.current.onClose){event.preventDefault();actions.current.onClose();}
      if(event.key==='Tab'){const items=focusables(),first=items[0],last=items[items.length-1];if(!first){event.preventDefault();root.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    };
    document.addEventListener('keydown',keydown);
    return()=>{document.removeEventListener('keydown',keydown);for(const entry of blocked)entry.element.inert=entry.inert;previous?.focus();};
  },[open]);
  return <BlockingFullscreenModal open={open}><div ref={content} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} className="config-editor max-h-[90vh] w-[min(42rem,90vw)] space-y-3 overflow-auto rounded-xl bg-white p-4 text-slate-800 shadow-xl"><h3 className="font-semibold">{title}</h3>{children}</div></BlockingFullscreenModal>;
}
