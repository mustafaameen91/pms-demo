"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * The app's dropdown: styled the same on every OS (the native <select> looks different on
 * Windows, macOS and Linux), but used like one: plain <option>/<optgroup> children, `value` or
 * `defaultValue`, `name` for forms (submitted through a hidden input), `required`, and a form
 * reset puts it back to `defaultValue`.
 */
type Option = { value: string; label: React.ReactNode; text: string; disabled: boolean };
type Group = { label: string; options: Option[] };

// Radix reserves "" for "no value", so an empty option is stored under this key.
const EMPTY = "__empty__";
const toKey = (v: string) => (v === "" ? EMPTY : v);
const fromKey = (k: string) => (k === EMPTY ? "" : k);

const textOf = (node: React.ReactNode): string =>
  typeof node === "string" || typeof node === "number"
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join("")
      : React.isValidElement<{ children?: React.ReactNode }>(node)
        ? textOf(node.props.children)
        : "";

function readOptions(children: React.ReactNode): (Option | Group)[] {
  const out: (Option | Group)[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      out.push(...readOptions((child.props as { children?: React.ReactNode }).children));
      return;
    }
    if (child.type === "optgroup") {
      const p = child.props as { label: string; children?: React.ReactNode };
      out.push({ label: p.label, options: readOptions(p.children).flatMap((o) => ("options" in o ? o.options : [o])) });
      return;
    }
    if (child.type === "option") {
      const p = child.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean };
      const label = p.children;
      out.push({ value: String(p.value ?? textOf(label)), label, text: textOf(label), disabled: !!p.disabled });
    }
  });
  return out;
}

type SelectBoxProps = {
  id?: string;
  name?: string;
  form?: string;
  value?: string | number | null;
  defaultValue?: string | number | null;
  onValueChange?: (value: string) => void;
  /** Shown when nothing (or "") is chosen and there is no "" option. */
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default";
  children?: React.ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  title?: string;
};

export function SelectBox({
  id,
  name,
  form,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  required,
  disabled,
  className,
  size,
  children,
  title,
  ...aria
}: SelectBoxProps) {
  const items = React.useMemo(() => readOptions(children), [children]);
  const flat = items.flatMap((o) => ("options" in o ? o.options : [o]));
  const controlled = value !== undefined;
  const initial = String(defaultValue ?? "");
  const [own, setOwn] = React.useState(initial);
  const current = controlled ? String(value ?? "") : own;
  const chosen = flat.find((o) => o.value === current);
  const field = React.useRef<HTMLInputElement>(null);

  // A form reset (e.g. after saving) puts an uncontrolled box back to its default.
  React.useEffect(() => {
    const f = field.current?.form;
    if (!f || controlled) return;
    const reset = () => setOwn(initial);
    f.addEventListener("reset", reset);
    return () => f.removeEventListener("reset", reset);
  }, [controlled, initial]);

  const change = (key: string) => {
    const v = fromKey(key);
    if (!controlled) setOwn(v);
    onValueChange?.(v);
    // Native selects fire "change" on their form; some forms listen for it (auto-save).
    queueMicrotask(() => field.current?.dispatchEvent(new Event("change", { bubbles: true })));
  };

  const item = (o: Option) => (
    <SelectItem key={o.value} value={toKey(o.value)} disabled={o.disabled} textValue={o.text}>
      {o.label}
    </SelectItem>
  );

  return (
    <>
      <Select value={chosen ? toKey(current) : ""} onValueChange={change} disabled={disabled}>
        <SelectTrigger
          id={id}
          size={size}
          title={title}
          className={cn("h-8 w-auto justify-between bg-transparent text-start font-normal", className)}
          {...aria}
        >
          <SelectValue placeholder={placeholder ?? chosen?.text ?? ""} />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {items.map((o, i) =>
            "options" in o ? (
              <SelectGroup key={`g${i}`}>
                <SelectLabel>{o.label}</SelectLabel>
                {o.options.map(item)}
              </SelectGroup>
            ) : (
              item(o)
            ),
          )}
        </SelectContent>
      </Select>
      {/* What the form submits, and what makes `required` work like a native select. */}
      <input
        ref={field}
        tabIndex={-1}
        aria-hidden
        name={name}
        form={form}
        required={required}
        disabled={disabled}
        value={current}
        onChange={() => {}}
        onInvalid={() => document.getElementById(id ?? "")?.focus()}
        className="sr-only"
      />
    </>
  );
}
