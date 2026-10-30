import { useEffect, useRef, useState } from "react";
import {
  randomCategories,
  randomFieldList,
  type RandomCategoryMeta,
  type RandomFieldKey,
} from "../site.config";

/**
 * The /game field picker: categories (大类) on the left third, the active
 * category's fields (小类) on the right two thirds.
 *
 * Fields are what get ticked; a category's box only reflects them. All of its
 * fields ticked shows a tick, some shows a dash (the native `indeterminate`
 * state), none shows empty. Ticking a category's box selects all its fields,
 * or clears them if they were all on already. Clicking a category's name
 * shows its fields without changing anything.
 *
 * Edits go to a draft and only reach the page on 确定, so 取消, Escape and a
 * click on the backdrop all leave the selection as it was. An empty
 * selection cannot be confirmed: there would be nothing to draw from.
 *
 * A native <dialog> opened with showModal(): it brings the focus trap, the
 * Escape key and the top layer, so nothing behind it can sit on top.
 */

const ALL_KEYS: RandomFieldKey[] = randomFieldList.map((f) => f.key);

function keysOf(category: RandomCategoryMeta): RandomFieldKey[] {
  return category.fields.map((f) => `${category.id}/${f.id}`);
}

/** A checkbox that can also show the dash. */
function TriCheck({
  checked,
  mixed,
  onChange,
  label,
}: {
  checked: boolean;
  mixed: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Not an attribute, only a property, so React cannot set it for us.
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="picker__check"
      checked={checked}
      onChange={onChange}
      aria-label={label}
    />
  );
}

export function FieldPicker({
  open,
  selected,
  onConfirm,
  onClose,
}: {
  open: boolean;
  selected: ReadonlySet<RandomFieldKey>;
  onConfirm: (next: Set<RandomFieldKey>) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Set<RandomFieldKey>>(() => new Set(selected));
  const [active, setActive] = useState(randomCategories[0]!.id);

  // Opening starts a fresh draft from what the page has.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open) {
      setDraft(new Set(selected));
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open, selected]);

  const toggleField = (key: RandomFieldKey) =>
    setDraft((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleCategory = (category: RandomCategoryMeta) =>
    setDraft((cur) => {
      const keys = keysOf(category);
      const allOn = keys.every((k) => cur.has(k));
      const next = new Set(cur);
      for (const k of keys) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });

  const current =
    randomCategories.find((c) => c.id === active) ?? randomCategories[0]!;

  return (
    <dialog
      ref={dialog}
      className="picker"
      aria-labelledby="picker-title"
      // Escape: route it through the page's state instead of letting the
      // element close itself behind React's back.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // The dialog box itself has no padding, so a click whose target is the
      // <dialog> element landed on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="picker__panel">
        <header className="picker__head">
          <h2 className="picker__title" id="picker-title">
            选择领域
          </h2>
          <span className="label picker__count">
            已选 {draft.size} / {ALL_KEYS.length}
          </span>
        </header>

        <div className="picker__body">
          <ul className="picker__cats" aria-label="大类">
            {randomCategories.map((c) => {
              const keys = keysOf(c);
              const on = keys.filter((k) => draft.has(k)).length;
              return (
                <li
                  key={c.id}
                  className="picker__cat"
                  data-active={c.id === current.id || undefined}
                >
                  <TriCheck
                    checked={on === keys.length}
                    mixed={on > 0 && on < keys.length}
                    onChange={() => {
                      toggleCategory(c);
                      setActive(c.id);
                    }}
                    label={`${c.title}：全选`}
                  />
                  <button
                    type="button"
                    className="picker__cat-name"
                    aria-pressed={c.id === current.id}
                    onClick={() => setActive(c.id)}
                  >
                    {c.title}
                    {keys.length > 1 && (
                      <span className="picker__cat-n">
                        {on}/{keys.length}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="picker__fields" role="group" aria-label={`${current.title}的小类`}>
            <p className="label picker__fields-head">{current.title}</p>
            <ul>
              {current.fields.map((f) => {
                const key = `${current.id}/${f.id}`;
                return (
                  <li key={key}>
                    <label className="picker__field">
                      <input
                        type="checkbox"
                        className="picker__check"
                        checked={draft.has(key)}
                        onChange={() => toggleField(key)}
                      />
                      <span>{f.title}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <footer className="picker__foot">
          <button
            type="button"
            className="picker__link"
            onClick={() => setDraft(new Set(ALL_KEYS))}
          >
            全选
          </button>
          <button
            type="button"
            className="picker__link"
            onClick={() => setDraft(new Set())}
          >
            清空
          </button>
          <span className="picker__spacer" />
          {draft.size === 0 && <span className="picker__hint">至少选一个小类</span>}
          <button type="button" className="picker__button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="picker__button picker__button--primary"
            disabled={draft.size === 0}
            onClick={() => onConfirm(new Set(draft))}
          >
            确定
          </button>
        </footer>
      </div>
    </dialog>
  );
}
