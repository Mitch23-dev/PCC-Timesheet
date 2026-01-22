"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type DropdownOption =
  | string
  | {
      value: string;
      label: string;
    };

function optValue(o: DropdownOption): string {
  return typeof o === "string" ? o : o.value;
}

function optLabel(o: DropdownOption): string {
  return typeof o === "string" ? o : o.label;
}

export default function ScrollableDropdown({
  value,
  options,
  onChange,
  placeholder = "Select…",
  maxHeight = 280,
}: {
  value: string;
  options: ReadonlyArray<DropdownOption>;
  onChange: (next: string) => void;
  placeholder?: string;
  maxHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number }>({ left: 0, top: 0, width: 280 });

  const selectedLabel = useMemo(() => {
    const found = options.find((o) => optValue(o) === value);
    // If the current value isn't in the list (e.g., legacy DB value), show it anyway
    // so the user can see what is currently saved and change it.
    return found ? optLabel(found) : String(value || "");
  }, [options, value]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 6, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const isInside = (n: Node) =>
      (btnRef.current && btnRef.current.contains(n)) ||
      (menuRef.current && menuRef.current.contains(n));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    // Use pointerdown in capture phase so iOS/Android taps are handled reliably.
    // IMPORTANT: ignore taps inside the button or the open menu, otherwise the menu
    // can close before an option click fires on mobile.
    const onPointerDown = (e: PointerEvent) => {
      const path = typeof e.composedPath === "function" ? (e.composedPath() as EventTarget[]) : null;
      if (path) {
        for (const t of path) {
          if (t instanceof Node && isInside(t)) return;
        }
      } else {
        const t = e.target as Node | null;
        if (t && isInside(t)) return;
      }
      setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="input"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          cursor: "pointer",
          userSelect: "none",
          fontSize: 16,
          lineHeight: 1.25,
        }}
        onClick={() => setOpen((p) => !p)}
      >
        <span style={{ textAlign: "left" }}>{(value ? selectedLabel : "") || placeholder}</span>
        <span style={{ opacity: 0.6 }}>▾</span>
      </button>

      {mounted && open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              width: pos.width,
              zIndex: 9999,
              background: "#fff",
              color: "#111",
              border: "1px solid rgba(0,0,0,0.18)",
              borderRadius: 12,
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
              maxHeight,
              overflowY: "auto",
              padding: 6,
            }}
          >
            {options.map((o) => {
              const v = optValue(o);
              const lab = optLabel(o);
              return (
                <button
                  key={`${lab}__${v}`}
                  type="button"
                  onClick={() => {
                    onChange(v);
                    setOpen(false);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 12px",
                    borderRadius: 10,
                    border: "none",
                    background: v === value ? "rgba(0,0,0,0.06)" : "transparent",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1.25,
                  }}
                >
                  {lab}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
