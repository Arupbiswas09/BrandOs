"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { addTags, cleanTag, resolveTag, tagKey, timesUsed, type TagUse } from "@/lib/tags";
import { cx } from "@/components/ui";

/** How many suggestions show at once. */
const SHOWN = 6;

/**
 * Tags as chips, with the tags already in use suggested as you type. Enter or
 * a comma adds what is typed, and a near-copy of a tag in use ("Grants" for
 * "grant") becomes that tag, so the list does not drift. The half-typed text
 * is the form's (`text`): leaving the box keeps it as typed, and a save adds
 * it with addTags. Nothing here changes the form's height on blur, so a press
 * on Save that moves focus out of the box still lands on Save.
 */
export function TagInput({ value, onChange, text, onText, pool, placeholder, label = "Tags", above }: {
  value: string[];
  onChange: (tags: string[]) => void;
  text: string;
  onText: (text: string) => void;
  /** Tags to suggest, most used first (see tagPool). */
  pool: TagUse[];
  placeholder?: string;
  label?: string;
  /** Opens the suggestions above the box, for a field at the foot of a dialog where below would be cut off. */
  above?: boolean;
}) {
  const uid = useId();
  const box = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  // Read out after each change, since a chip appearing says nothing to a screen reader.
  const [said, setSaid] = useState("");

  const q = cleanTag(text);
  const k = tagKey(q);
  const free = pool.filter((p) => !value.some((v) => tagKey(v) === tagKey(p.tag)));
  // A tag in use that the typed text is a near-copy of comes first, and is what Enter adds.
  const same = q ? free.find((p) => tagKey(p.tag) === k) : undefined;
  const options = q
    ? [
        ...(same ? [same] : []),
        // Tags that start with the text before ones that only contain it; otherwise most used first.
        ...free.filter((p) => p !== same && (p.tag.includes(q) || tagKey(p.tag).includes(k)))
          .sort((a, b) => Number(!a.tag.startsWith(q)) - Number(!b.tag.startsWith(q))),
      ].slice(0, SHOWN)
    : free.slice(0, SHOWN);
  const shown = open && options.length > 0;
  const active = !shown ? -1 : cursor >= 0 ? Math.min(cursor, options.length - 1) : same ? 0 : -1;
  const optId = (i: number) => `${uid}-opt-${i}`;

  /** Adds typed text (commas split it), then leaves `rest` in the box. */
  const add = (typed: string, rest = "") => {
    const next = addTags(value, typed, pool);
    const added = next.slice(value.length);
    if (added.length) onChange(next);
    const first = typed.split(",").find((t) => t.trim());
    setSaid(added.length ? `Added ${added.join(", ")}` : first ? `${resolveTag(first, pool, value)} is already added` : "");
    onText(rest);
    setCursor(-1);
  };
  const remove = (t: string) => {
    onChange(value.filter((x) => x !== t));
    setSaid(`Removed ${t}`);
  };

  /** A comma adds everything before it; suggestions show while there is text in the box. */
  const onType = (v: string) => {
    let rest = v;
    if (v.includes(",")) {
      const parts = v.split(",");
      rest = parts.pop()!.trimStart();
      add(parts.join(","), rest);
    } else {
      onText(v);
      setCursor(-1);
    }
    setOpen(!!rest.trim());
  };

  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter that ends an IME composition belongs to the composition.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const down = e.key === "ArrowDown";
      if (!shown) { setOpen(true); setCursor(down ? 0 : SHOWN - 1); return; }
      const n = options.length;
      setCursor(active < 0 ? (down ? 0 : n - 1) : (active + (down ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      // With nothing typed and nothing picked, Enter saves the form as it does in any other field.
      if (active >= 0) { e.preventDefault(); add(options[active].tag); setOpen(false); }
      else if (text.trim()) { e.preventDefault(); add(text); setOpen(false); }
    } else if (e.key === "Escape" && shown) {
      // Closes the suggestions only; a second Escape closes the dialog.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setCursor(-1);
    } else if (e.key === "Backspace" && !text && value.length) {
      remove(value[value.length - 1]);
    }
  };

  return (
    <div>
      <div className="label flex justify-between gap-2">
        <label htmlFor={`${uid}-input`}>{label}</label>
        <span id={`${uid}-hint`} className="font-normal text-mute-4">Enter or a comma adds a tag</span>
      </div>
      <div className="relative">
        {/* A click anywhere in the box, between chips too, lands in the text field. */}
        <div
          onClick={() => box.current?.focus()}
          className="field flex cursor-text flex-wrap items-center gap-1.5 px-2 py-[6px] focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--bos-accent)_16%,transparent)]"
        >
          {value.map((t) => (
            <span key={t} className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-soft py-[2px] pl-2.5 pr-[3px] text-[14px] font-medium text-accent">
              <span className="truncate">{t}</span>
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                onClick={() => { remove(t); box.current?.focus(); }}
                className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-mute-3 transition-colors hover:bg-hover hover:text-ink"
              >
                <X aria-hidden size={13} />
              </button>
            </span>
          ))}
          <input
            ref={box}
            id={`${uid}-input`}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={shown}
            aria-controls={shown ? `${uid}-list` : undefined}
            aria-activedescendant={active >= 0 ? optId(active) : undefined}
            aria-describedby={`${uid}-hint`}
            autoComplete="off"
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={keys}
            onBlur={() => setOpen(false)}
            placeholder={value.length ? undefined : placeholder}
            className="min-w-[9ch] flex-1 border-0 bg-transparent px-1 py-1 text-[15px] outline-none"
          />
        </div>
        {shown && (
          // Floats over the fields around it rather than pushing them down. Pressing on a
          // suggestion keeps focus in the text field, so the list is still there when the click lands.
          <ul
            id={`${uid}-list`}
            role="listbox"
            aria-label="Suggested tags"
            onMouseDown={(e) => e.preventDefault()}
            className={cx(
              "absolute inset-x-0 z-20 m-0 flex list-none flex-col gap-px rounded-[10px] border border-line bg-white p-1 shadow-[0_10px_28px_rgba(16,22,20,.14)]",
              above ? "bottom-full mb-1.5" : "top-full mt-1.5",
            )}
          >
            {options.map((o, i) => (
              <li
                key={o.tag}
                id={optId(i)}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setCursor(i)}
                onClick={() => { add(o.tag); setOpen(false); }}
                className={cx("flex cursor-pointer items-baseline gap-3 rounded-[7px] px-2.5 py-1.5 text-[14.5px] text-ink-3", i === active && "bg-soft")}
              >
                {o === same ? (
                  <span className="min-w-0 flex-1">Use “<span className="font-semibold text-ink">{o.tag}</span>” <span className="text-mute-2">(already used {timesUsed(o.n)})</span></span>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{o.tag}</span>
                    <span className="flex-none text-[13px] text-mute-3">used {timesUsed(o.n)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <span role="status" className="sr-only">{said}</span>
    </div>
  );
}
