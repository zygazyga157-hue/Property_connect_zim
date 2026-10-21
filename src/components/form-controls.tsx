"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

type DialogInputProps = {
  open: boolean;
  title: string;
  description: string;
  label: string;
  submitLabel: string;
  type?: "text" | "password";
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void | Promise<void>;
};

export function DialogInput({ open, title, description, label, submitLabel, type = "text", busy = false, onCancel, onSubmit }: DialogInputProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    if (!open && dialog.open) {
      dialog.close();
      setValue("");
      setError("");
    }
  }, [open]);

  function close() {
    setValue("");
    setError("");
    onCancel();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = type === "password" ? value : value.trim();
    if (!submitted || (type === "text" && submitted.length < 4)) {
      setError(type === "password" ? "Enter your password to continue." : "Enter a reason of at least four characters.");
      return;
    }
    setError("");
    try { await onSubmit(submitted); setValue(""); setError(""); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "The request could not be completed."); }
  }

  return <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); if (!busy) close(); }} aria-labelledby={inputId + "-title"} aria-describedby={inputId + "-description"} className="fixed inset-0 m-auto w-[min(92vw,30rem)] max-w-none rounded-[4px] border border-graphite-300 bg-paper-50 p-0 text-ink-900 shadow-[0_24px_80px_rgba(10,20,36,.25)] backdrop:bg-ink-900/50">
    <form onSubmit={submit} className="space-y-5 p-5 sm:p-7">
      <div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-ink-500">Secure confirmation</p><h2 id={inputId + "-title"} className="mt-2 font-deed text-2xl">{title}</h2><p id={inputId + "-description"} className="mt-2 text-sm leading-6 text-ink-500">{description}</p></div>
      <div className="space-y-1.5"><label htmlFor={inputId + "-value"} className="block text-xs font-medium text-ink-700">{label}</label><input ref={inputRef} id={inputId + "-value"} type={type} value={value} onChange={(event) => { setValue(event.target.value); setError(""); }} autoComplete={type === "password" ? "current-password" : "off"} aria-invalid={Boolean(error)} aria-describedby={error ? inputId + "-error" : undefined} className="min-h-11 w-full rounded-[4px] border border-graphite-300 bg-paper-50 px-3 text-sm aria-[invalid=true]:border-red-700" />{error ? <p id={inputId + "-error"} role="alert" className="text-xs text-red-800">{error}</p> : null}</div>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={close} className="min-h-10 border border-graphite-300 px-4 text-xs font-medium text-ink-700 hover:bg-paper-100 disabled:opacity-60">Cancel</button><button type="submit" disabled={busy} className="inline-flex min-h-10 items-center gap-2 border border-brand-700 bg-brand-700 px-4 text-xs font-medium text-white hover:bg-brand-900 disabled:opacity-60">{busy ? "Working…" : submitLabel}</button></div>
    </form>
  </dialog>;
}

type RegistrySelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function RegistrySelect({ className = "", children, ...props }: RegistrySelectProps) {
  return <span className="relative block">
    <select {...props} className={"min-h-11 w-full appearance-none rounded-[4px] border border-graphite-300 bg-paper-50 px-3 pr-9 text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 " + className}>{children}</select>
    <ChevronDown aria-hidden="true" size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-500" />
  </span>;
}
