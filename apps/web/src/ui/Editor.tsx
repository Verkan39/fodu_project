import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Compartment, EditorState, StateEffect, StateField, type Text } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  WidgetType,
  keymap,
  lineNumbers,
  placeholder as placeholderExt,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';

/** What to draw on one editor line, decided by the screen and handed down. */
export interface LineMark {
  /** 1-based editor line. */
  line: number;
  kind: 'ok' | 'current' | 'error' | 'viewing';
  /** Small word at the right of an error row, e.g. "illegal". */
  label?: string;
  /** Wavy underline under the first word (a command we don't understand). */
  underlineFirstWord?: boolean;
}

const CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PLAY = '<svg width="14" height="16" viewBox="0 0 14 16"><path d="M2 1.5v13l11-6.5z" fill="#f4b731"/></svg>';
const BANG = '<svg width="4" height="12" viewBox="0 0 4 12"><rect width="4" height="7.5" rx="2" fill="#fff"/><circle cx="2" cy="10.2" r="1.8" fill="#fff"/></svg>';

class MarkWidget extends WidgetType {
  constructor(readonly kind: LineMark['kind'], readonly label: string | undefined) {
    super();
  }
  eq(other: MarkWidget) {
    return other.kind === this.kind && other.label === this.label;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'line-end';
    if (this.kind === 'ok' || this.kind === 'viewing') el.innerHTML = `<span class="mark-dot ok">${CHECK}</span>`;
    else if (this.kind === 'current') el.innerHTML = PLAY;
    else if (this.kind === 'error') el.innerHTML = `${this.label ?? ''}<span class="mark-dot bad">${BANG}</span>`;
    return el;
  }
}

const lineClass: Record<LineMark['kind'], string> = {
  ok: '',
  current: 'line-current',
  error: 'line-error',
  viewing: 'line-viewing',
};

function build(doc: Text, marks: readonly LineMark[]): DecorationSet {
  const ranges = [];
  for (const m of marks) {
    if (m.line < 1 || m.line > doc.lines) continue;
    const line = doc.line(m.line);
    if (lineClass[m.kind] !== '') ranges.push(Decoration.line({ class: lineClass[m.kind] }).range(line.from));
    ranges.push(Decoration.widget({ widget: new MarkWidget(m.kind, m.label), side: 1 }).range(line.to));
    if (m.underlineFirstWord) {
      const lead = line.text.length - line.text.trimStart().length;
      const word = line.text.trimStart().split(/\s+/)[0] ?? '';
      if (word !== '') ranges.push(Decoration.mark({ class: 'tok-bad' }).range(line.from + lead, line.from + lead + word.length));
    }
  }
  return Decoration.set(ranges, true);
}

const setMarks = StateEffect.define<readonly LineMark[]>();

const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) if (e.is(setMarks)) return build(tr.state.doc, e.value);
    return tr.docChanged ? deco.map(tr.changes) : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Colours the words of a proof: numbers, colour names, helper parameters and comments. */
const TOKENS = /(--.*$)|(\$[a-z][a-z0-9]*)|\b(yellow|blue|pink|green|white)\b|\b(\d+)\b/g;
const tokenDecorator = new MatchDecorator({
  regexp: TOKENS,
  decoration: (m) =>
    Decoration.mark({
      class: m[1] ? 'tok-comment' : m[2] ? 'tok-param' : m[3] ? `tok-c-${m[3]}` : 'tok-num',
    }),
});
const tokens = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = tokenDecorator.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = tokenDecorator.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

interface Props {
  value: string;
  onChange: (text: string) => void;
  readOnly: boolean;
  placeholder: string;
  marks: readonly LineMark[];
  /** Called with the 1-based line the player clicked. */
  onLineClick?: (line: number) => void;
  label: string;
  className?: string;
}

export function Editor({ value, onChange, readOnly, placeholder, marks, onLineClick, label, className }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  // The latest callbacks, so the editor is created once but never calls a stale one.
  const onChangeRef = useRef(onChange);
  const onLineClickRef = useRef(onLineClick);
  onChangeRef.current = onChange;
  onLineClickRef.current = onLineClick;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          lineNumbers(),
          tokens,
          marksField,
          placeholderExt(placeholder),
          editable.current.of([EditorView.editable.of(!readOnly), EditorState.readOnly.of(readOnly)]),
          EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', 'aria-label': label }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            click(e, editor) {
              const pos = editor.posAtCoords({ x: e.clientX, y: e.clientY });
              if (pos !== null) onLineClickRef.current?.(editor.state.doc.lineAt(pos).number);
            },
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // The editor is created once; later changes arrive through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure([EditorView.editable.of(!readOnly), EditorState.readOnly.of(readOnly)]),
    });
  }, [readOnly]);

  useEffect(() => {
    view.current?.dispatch({ effects: setMarks.of(marks) });
  }, [marks, value]);

  return <div ref={host} className={className} />;
}
