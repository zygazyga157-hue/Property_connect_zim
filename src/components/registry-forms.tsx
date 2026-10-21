"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { authClient } from "@/lib/auth-client";
import { DeedPlate, KeyIssued, Keyhole, RegistryForm, SecurityBanner } from "@/components/identity";
import { DialogInput, RegistrySelect } from "@/components/form-controls";
import { AgentInvitationList } from "@/components/agent-invitation-list";

type Status = { message: string; tone?: "error" | "success" } | null;
type FieldErrors = Record<string, string[]>;

async function sendJson(url: string, body: unknown, method = "POST") {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result?.error?.message ?? "The request could not be completed.") as Error & { fields?: FieldErrors; code?: string };
    error.fields = result?.error?.details?.fields;
    error.code = result?.error?.code;
    throw error;
  }
  return result.data;
}

async function uploadMedia(file: File) {
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");
  const request = await sendJson("/api/media/upload-url", {
    fileName: file.name, contentType: file.type, sizeBytes: file.size,
  });
  const uploaded = await fetch(request.uploadUrl, {
    method: "PUT", headers: { "content-type": file.type }, body: file,
  });
  if (!uploaded.ok) throw new Error("The image upload did not finish. Please try again.");
  return { objectKey: request.objectKey as string, publicUrl: request.publicUrl as string };
}

function previewFile(file: File, setPreview: (value: string) => void) {
  const reader = new FileReader();
  reader.onload = () => setPreview(String(reader.result ?? ""));
  reader.readAsDataURL(file);
}

function FormStatus({ status }: { status: Status }) {
  if (!status) return null;
  return <p role={status.tone === "error" ? "alert" : "status"} aria-live="polite" className="border border-graphite-300 bg-paper-100 px-3 py-2.5 text-sm leading-5 text-ink-700">{status.message}</p>;
}

function Field({ label, name, type = "text", required = false, defaultValue, autoComplete, hint, errors, pattern }: {
  label: string; name: string; type?: string; required?: boolean; defaultValue?: string; autoComplete?: string; hint?: string; errors?: string[]; pattern?: string;
}) {
  const id = "field-" + name.replaceAll(".", "-");
  const describedBy = [hint ? id + "-hint" : "", errors?.length ? id + "-error" : ""].filter(Boolean).join(" ") || undefined;
  return <div className="space-y-1.5"><label htmlFor={id} className="block text-xs font-medium text-ink-700">{label}{required ? <span aria-hidden="true"> *</span> : null}</label><input id={id} name={name} type={type} required={required} defaultValue={defaultValue} autoComplete={autoComplete} pattern={pattern} aria-invalid={Boolean(errors?.length)} aria-describedby={describedBy} className="min-h-11 w-full rounded-[4px] border border-graphite-300 bg-paper-50 px-3 text-sm text-ink-900 placeholder:text-ink-300 aria-[invalid=true]:border-red-700" />{hint ? <p id={id + "-hint"} className="text-xs leading-5 text-ink-500">{hint}</p> : null}{errors?.length ? <p id={id + "-error"} className="text-xs leading-5 text-red-800">{errors[0]}</p> : null}</div>;
}

function ActionButton({ children, busy = false, disabled = false }: { children: React.ReactNode; busy?: boolean; disabled?: boolean }) {
  return <button type="submit" disabled={busy || disabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[4px] border border-brand-700 bg-brand-700 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60">{busy ? <span className="size-3 animate-spin rounded-full border border-white border-r-transparent" aria-hidden="true" /> : null}{children}</button>;
}

export function LoginForm({ returnTo = "/workspace" }: { returnTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [showVerificationLink, setShowVerificationLink] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus({ message: "Identifying your account…" });
    setShowVerificationLink(false);
    const data = new FormData(event.currentTarget);
    try {
      if (twoFactorRequired) {
        setStatus({ message: "Verifying authenticator code…" });
        const verification = await authClient.twoFactor.verifyTotp({ code: String(data.get("totp") ?? "") });
        if (verification.error) throw new Error(verification.error.message ?? "The authenticator code is incorrect.");
      } else {
        setStatus({ message: "Verifying credentials…" });
        const result = await authClient.signIn.email({ email: String(data.get("email")), password: String(data.get("password")) });
        if (result.error) {
          const authError = result.error as typeof result.error & { code?: string };
          const message = authError.message ?? "Email or password is incorrect.";
          if (authError.code === "EMAIL_NOT_VERIFIED" || /email.{0,20}verif|verif.{0,20}email/i.test(message)) setShowVerificationLink(true);
          throw new Error(message);
        }
        if ((result.data as typeof result.data & { twoFactorRedirect?: boolean })?.twoFactorRedirect) {
          setTwoFactorRequired(true);
          setStatus({ message: "Enter the current code from your authenticator app." });
          return;
        }
      }
      setStatus({ message: "Sealing your session…" });
      setStatus({ message: "Taking you to your workspace…" });
      router.push(returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/workspace");
      router.refresh();
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : "Email or password is incorrect.", tone: "error" });
    } finally { setBusy(false); }
  }
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/workspace";
  return <div className="space-y-5"><RegistryForm onSubmit={submit}><Field label="Email address" name="email" type="email" autoComplete="email" required /><div className="relative"><Field label="Password" name="password" type="password" autoComplete="current-password" required /><span className="pointer-events-none absolute right-3 top-[38px]"><Keyhole /></span></div>{twoFactorRequired ? <Field label="Authenticator code" name="totp" required autoComplete="one-time-code" hint="Enter the current six-digit code." /> : null}<FormStatus status={status} />{showVerificationLink ? <p className="text-xs text-ink-600">This account needs email verification. <Link href={"/verify-email?returnTo=" + encodeURIComponent(safeReturnTo)} className="text-brand-700 underline underline-offset-4">Resend the verification email</Link>.</p> : null}<ActionButton busy={busy}>{twoFactorRequired ? "Verify and sign in" : "Sign in"}</ActionButton></RegistryForm></div>;
}

export function BuyerSignupForm() {
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<Status>(null); const [accountExists, setAccountExists] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus({ message: "Creating your named account…" }); setAccountExists(false);
    const data = new FormData(event.currentTarget); const password = String(data.get("password") ?? "");
    if (password.length < 12 || password.length > 128) { setStatus({ message: "Use a password between 12 and 128 characters.", tone: "error" }); setBusy(false); return; }
    if (password !== String(data.get("confirmPassword") ?? "")) { setStatus({ message: "Passwords do not match.", tone: "error" }); setBusy(false); return; }
    try {
      const result = await authClient.signUp.email({
        name: String(data.get("name")).trim(), email: String(data.get("email")).trim().toLowerCase(), password,
        callbackURL: "/verify-email?verified=1&returnTo=%2Fbuyer%2Fdashboard",
      });
      if (result.error) {
        const message = result.error.message ?? "Your account could not be created.";
        if ((result.error as typeof result.error & { code?: string }).code === "USER_ALREADY_EXISTS" || /already exists|already registered/i.test(message)) setAccountExists(true);
        throw new Error(message);
      }
      setStatus({ message: "Check your inbox for the verification link. Your buyer workspace will open after you verify your email.", tone: "success" });
    } catch (error) { setStatus({ message: error instanceof Error ? error.message : "Your account could not be created.", tone: "error" }); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3"><RegistryForm onSubmit={submit}><Field label="Full name" name="name" required autoComplete="name" /><Field label="Email address" name="email" type="email" required autoComplete="email" /><Field label="Create password" name="password" type="password" required autoComplete="new-password" hint="Use at least 12 characters." /><Field label="Confirm password" name="confirmPassword" type="password" required autoComplete="new-password" /><FormStatus status={status} /><ActionButton busy={busy}>Create buyer account</ActionButton></RegistryForm>{accountExists ? <p className="border border-graphite-200 bg-paper-100 p-3 text-xs text-ink-700">That email already has a named account. <Link href="/login?returnTo=%2Fbuyer%2Fdashboard" className="font-medium text-brand-700 underline underline-offset-4">Sign in to continue</Link> or <Link href="/forgot-password" className="text-brand-700 underline underline-offset-4">reset your password</Link>.</p> : null}</div>;
}

export function AgencyRegistrationForm() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [done, setDone] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [accountAction, setAccountAction] = useState<"sign-in" | "workspace" | null>(null);
  const [verificationPending, setVerificationPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFieldErrors({}); setAccountAction(null); setVerificationPending(false);
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries(data.entries());
    try {
      setStatus({ message: "Checking your EAC registration…" });
      let session = await authClient.getSession();
      if (!session.data?.user) {
        if (String(values.password).length < 12 || String(values.password).length > 128) throw new Error("Use a password between 12 and 128 characters.");
        if (values.password !== values.confirmPassword) throw new Error("Passwords do not match.");
        const signup = await authClient.signUp.email({
          name: String(values.contactName).trim(), email: String(values.email).trim().toLowerCase(), password: String(values.password),
          callbackURL: "/verify-email?verified=1&returnTo=%2Fregister%2Fagency",
        });
        if (signup.error) {
          const message = signup.error.message ?? "Your account could not be created.";
          if ((signup.error as typeof signup.error & { code?: string }).code === "USER_ALREADY_EXISTS" || /already exists|already registered/i.test(message)) {
            setAccountAction("sign-in");
            throw new Error("This email already has a named account. Sign in to continue your agency application.");
          }
          throw new Error(message);
        }
        session = await authClient.getSession();
        if (!session.data?.user) {
          setVerificationPending(true);
          setStatus({ message: "Account created. Verify your email, then return here to submit the agency application. If the message does not arrive, request another verification email from the verification page.", tone: "success" });
          return;
        }
      }
      setStatus({ message: "Registering your agency…" });
      await sendJson("/api/agency", {
        name: values.agencyName, eacRegistrationNumber: values.eacRegistrationNumber,
        email: values.email, phone: values.phone, address: values.address || undefined,
      });
      setStatus({ message: "Preparing your agency workspace…" });
      setDone(true);
      setStatus({ message: "Your application is awaiting manual EAC review.", tone: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The application could not be submitted.";
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "AGENCY_ALREADY_REGISTERED") setAccountAction("workspace");
      if (error && typeof error === "object" && "fields" in error) setFieldErrors((error as { fields?: FieldErrors }).fields ?? {});
      setStatus({ message: message.includes("EAC") ? "This EAC number is already on file. Contact support." : message, tone: "error" });
    } finally { setBusy(false); }
  }
  if (done) return <div className="space-y-4"><KeyIssued serial="EAC · REVIEW QUEUE" message="Your agency application is on file." /><p className="text-sm leading-6 text-ink-500">A platform administrator will review your EAC registration. The agency workspace opens after approval.</p></div>;
  return <RegistryForm onSubmit={submit}>
    <Field label="Contact name" name="contactName" required autoComplete="name" errors={fieldErrors.name} /><Field label="Contact email" name="email" type="email" required autoComplete="email" errors={fieldErrors.email} />
    <Field label="Create password" name="password" type="password" required autoComplete="new-password" hint="Use at least 12 characters." errors={fieldErrors.password} />
    <Field label="Confirm password" name="confirmPassword" type="password" required autoComplete="new-password" errors={fieldErrors.confirmPassword} />
    <div className="my-2 border-t border-graphite-200" />
    <Field label="Agency name" name="agencyName" required errors={fieldErrors.name} /><Field label="EAC registration number" name="eacRegistrationNumber" required hint="Use EAC/YYYY/NNNNN. Each application is reviewed manually." errors={fieldErrors.eacRegistrationNumber} />
    <Field label="Agency phone" name="phone" type="tel" required pattern="\+[1-9][0-9]{1,14}" hint="International format, for example +263771234567." errors={fieldErrors.phone} /><Field label="Office address" name="address" errors={fieldErrors.address} />
    <FormStatus status={status} />{verificationPending ? <p className="text-xs text-ink-600"><Link href="/verify-email?returnTo=%2Fregister%2Fagency" className="text-brand-700 underline underline-offset-4">Continue to email verification</Link>.</p> : null}{accountAction ? <p className="border border-graphite-200 bg-paper-100 p-3 text-xs text-ink-700">{accountAction === "sign-in" ? <>Continue with your existing identity. <Link href="/login?returnTo=%2Fregister%2Fagency" className="font-medium text-brand-700 underline underline-offset-4">Sign in and return to agency registration</Link>.</> : <>This account already belongs to an agency. <Link href="/workspace" className="font-medium text-brand-700 underline underline-offset-4">Open its workspace</Link>, or sign in with a different named account to apply for another agency.</>}</p> : null}<ActionButton busy={busy}>Submit agency application</ActionButton>
  </RegistryForm>;
}

export function AgentRegistrationForm({ invitationToken = "" }: { invitationToken?: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [done, setDone] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [alreadyLinked, setAlreadyLinked] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFieldErrors({}); setAlreadyLinked(false); setStatus({ message: "Preparing your agent profile…" });
    const data = new FormData(event.currentTarget);
    try {
      const photoObjectKey = photo ? (setStatus({ message: "Uploading your profile photo…" }), (await uploadMedia(photo)).objectKey) : undefined;
      await sendJson("/api/agents/register", {
        invitationToken: data.get("invitationToken"), fullName: data.get("fullName"),
        eacRegistrationNumber: data.get("eacRegistrationNumber"), phone: data.get("phone"),
        photoObjectKey,
      });
      setDone(true);
      setStatus({ message: "Your agency has been notified. Approval usually takes under 24 hours.", tone: "success" });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "AGENT_PROFILE_EXISTS") setAlreadyLinked(true);
      if (error && typeof error === "object" && "fields" in error) setFieldErrors((error as { fields?: FieldErrors }).fields ?? {});
      setStatus({ message: error instanceof Error ? error.message : "Your registration could not be submitted.", tone: "error" });
    }
    finally { setBusy(false); }
  }
  if (done) return <div className="space-y-4"><KeyIssued serial="EAC · REVIEW QUEUE" message="Your profile is awaiting review." /><FormStatus status={status} /></div>;
  return <RegistryForm onSubmit={submit}>
    <Field label="Invitation token" name="invitationToken" required defaultValue={invitationToken} hint="Use the invitation sent by your agency or lead agent." errors={fieldErrors.invitationToken} />
    <Field label="Full name" name="fullName" required autoComplete="name" errors={fieldErrors.fullName} /><Field label="EAC registration number" name="eacRegistrationNumber" required errors={fieldErrors.eacRegistrationNumber} />
    <Field label="Professional phone" name="phone" type="tel" required pattern="\+[1-9][0-9]{1,14}" hint="International format, for example +263771234567." errors={fieldErrors.phone} />
    <div className="space-y-2"><label htmlFor="agent-photo" className="block text-xs font-medium text-ink-700">Profile photo <span className="font-normal text-ink-500">(optional)</span></label><input id="agent-photo" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; setPhoto(file); if (file) previewFile(file, setPhotoPreview); }} className="block min-h-11 w-full border border-graphite-300 bg-paper-50 px-3 py-2 text-xs file:mr-3 file:border-0 file:bg-paper-100 file:px-3 file:py-1.5" /><p className="text-xs text-ink-500">JPEG, PNG, WebP or AVIF, up to 12 MB.</p></div>
    {photoPreview ? <div className="flex items-center gap-4 border border-graphite-200 bg-paper-100 p-4"><Image src={photoPreview} alt="Selected profile photo preview" width={64} height={64} unoptimized className="size-16 rounded-full border border-graphite-300 object-cover" /><p className="text-xs text-ink-600">Profile photo preview</p></div> : null}
    <FormStatus status={status} />{alreadyLinked ? <p className="border border-graphite-200 bg-paper-100 p-3 text-xs text-ink-700">This account already has an agent profile. <Link href="/agent/dashboard" className="font-medium text-brand-700 underline underline-offset-4">Open your agent workspace</Link>.</p> : null}<ActionButton busy={busy}>Submit agent profile</ActionButton>
  </RegistryForm>;
}

export function AgentInviteAccountForm({ invitationToken }: { invitationToken: string }) {
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<Status>(null); const [accountExists, setAccountExists] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setAccountExists(false); const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password.length < 12 || password.length > 128) { setStatus({ message: "Use a password between 12 and 128 characters.", tone: "error" }); setBusy(false); return; }
    if (password !== String(data.get("confirmPassword") ?? "")) { setStatus({ message: "Passwords do not match.", tone: "error" }); setBusy(false); return; }
    try {
      const invitation = await sendJson("/api/agents/invitations/verify", { invitationToken, email: String(data.get("email")).trim().toLowerCase() });
      const returnTo = "/register/agent?invite=" + encodeURIComponent(invitationToken);
      const callbackURL = "/verify-email?verified=1&returnTo=" + encodeURIComponent(returnTo);
      const result = await authClient.signUp.email({ name: String(data.get("name")), email: String(data.get("email")).trim().toLowerCase(), password, callbackURL });
      if (result.error) {
        const message = result.error.message ?? "Your account could not be created.";
        if ((result.error as typeof result.error & { code?: string }).code === "USER_ALREADY_EXISTS" || /already exists|already registered/i.test(message)) {
          setAccountExists(true);
          throw new Error("This email already has a named account. Sign in with it to complete the invitation.");
        }
        throw new Error(message);
      }
      setStatus({ message: "Your invitation to " + invitation.agencyName + " is valid. Verify the named account, then sign in to complete your professional record.", tone: "success" });
    } catch (error) { setStatus({ message: error instanceof Error ? error.message : "Your account could not be created.", tone: "error" }); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3"><RegistryForm onSubmit={submit}><Field label="Full name" name="name" required autoComplete="name" /><Field label="Invitation email" name="email" type="email" required autoComplete="email" /><Field label="Create password" name="password" type="password" required autoComplete="new-password" hint="Use at least 12 characters." /><Field label="Confirm password" name="confirmPassword" type="password" required autoComplete="new-password" /><FormStatus status={status} /><ActionButton busy={busy}>Create named account</ActionButton></RegistryForm>{accountExists ? <p className="border border-graphite-200 bg-paper-100 p-3 text-xs text-ink-700">The invitation remains active. <Link href={"/login?returnTo=" + encodeURIComponent("/register/agent?invite=" + invitationToken)} className="font-medium text-brand-700 underline underline-offset-4">Sign in and continue this invitation</Link>.</p> : null}</div>;
}

export function AgentProfileEditor({ initial }: { initial: { fullName: string; phone: string; bio: string | null; photoUrl: string | null } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState(initial.photoUrl ?? "");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus({ message: "Updating your professional record…" });
    const data = new FormData(event.currentTarget);
    try {
      const photoObjectKey = photo ? (setStatus({ message: "Uploading your profile photo…" }), (await uploadMedia(photo)).objectKey) : undefined;
      await sendJson("/api/agent/profile", {
        fullName: data.get("fullName"), phone: data.get("phone"),
        bio: String(data.get("bio") ?? "").trim() || undefined, photoObjectKey,
      }, "PUT");
      setStatus({ message: "Your professional record has been updated.", tone: "success" });
      router.refresh();
    } catch (error) { setStatus({ message: error instanceof Error ? error.message : "Your record could not be updated.", tone: "error" }); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">{photoPreview ? <div className="grid min-h-64 place-items-center border border-graphite-200 bg-paper-100 p-6"><div className="text-center"><Image src={photoPreview} alt="Your profile photo" width={96} height={96} unoptimized className="mx-auto size-24 rounded-full border-2 border-white object-cover shadow-sm" /><p className="mt-4 font-deed text-xl text-ink-900">{initial.fullName}</p><p className="mt-1 font-mono text-[10px] text-ink-500">PROFESSIONAL PROFILE</p></div></div> : <DeedPlate title="Professional profile preview"><p>Add an optional profile photo to complete your public record.</p></DeedPlate>}<RegistryForm onSubmit={submit} className="space-y-4">
    <Field label="Full name" name="fullName" required autoComplete="name" defaultValue={initial.fullName} /><Field label="Professional phone" name="phone" type="tel" required defaultValue={initial.phone} />
    <div className="space-y-1.5"><label htmlFor="agent-bio" className="block text-xs font-medium text-ink-700">Professional introduction</label><textarea id="agent-bio" name="bio" rows={5} maxLength={2000} defaultValue={initial.bio ?? ""} className="w-full border border-graphite-300 bg-paper-50 px-3 py-2 text-sm" /></div>
    <div className="space-y-2"><label htmlFor="agent-photo-edit" className="block text-xs font-medium text-ink-700">Replace profile photo</label><input id="agent-photo-edit" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; setPhoto(file); if (file) previewFile(file, setPhotoPreview); }} className="block min-h-11 w-full border border-graphite-300 bg-paper-50 px-3 py-2 text-xs file:mr-3 file:border-0 file:bg-paper-100 file:px-3 file:py-1.5" /><p className="text-xs text-ink-500">JPEG, PNG, WebP or AVIF, up to 12 MB.</p></div>
    <FormStatus status={status} /><ActionButton busy={busy}>Save professional record</ActionButton>
  </RegistryForm></div>;
}

export function ActivationForm() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [serial, setSerial] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus({ message: "Verifying serial and code…" });
    const data = new FormData(event.currentTarget);
    try {
      const response = await sendJson("/api/activate", { serial: data.get("serial"), code: data.get("code") });
      setSerial(response.serial); setExpiresAt(response.expiresAt ? new Date(response.expiresAt).toLocaleDateString() : "");
      setStatus({ message: response.state === "sealed" || response.state === "already_active" ? "Your card is active." : "The activation result is being confirmed.", tone: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The card could not be activated.";
      setStatus({ message: message.includes("code") ? "That code didn't match. Check the code and try again." : message, tone: "error" });
    } finally { setBusy(false); }
  }
  return <div className="space-y-5"><SecurityBanner /><RegistryForm onSubmit={submit}>
    <Field label="Gold Card serial" name="serial" required hint="Enter the serial printed on the admin-issued digital card." />
    <Field label="Activation code" name="code" type="password" required autoComplete="one-time-code" />
    <FormStatus status={status} /><ActionButton busy={busy}>Verify and activate</ActionButton>
  </RegistryForm>{serial ? <div className="space-y-2"><KeyIssued serial={serial} />{expiresAt ? <p className="text-xs text-ink-500">Access ends {expiresAt}.</p> : null}</div> : null}</div>;
}

export function EnquiryForm({ propertyId }: { propertyId: string }) {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await sendJson("/api/properties/" + propertyId + "/enquiries", {
        buyerName: data.get("buyerName"), buyerEmail: data.get("buyerEmail"), buyerPhone: data.get("buyerPhone") || undefined,
        message: data.get("message"), website: data.get("website") || undefined,
      });
      form.reset();
      setStatus({ message: "Your enquiry has been sent to the agent.", tone: "success" });
    } catch (error) { setStatus({ message: error instanceof Error ? error.message : "The enquiry could not be sent.", tone: "error" }); }
    finally { setBusy(false); }
  }
  return <RegistryForm onSubmit={submit}><Field label="Your name" name="buyerName" required autoComplete="name" /><Field label="Email address" name="buyerEmail" type="email" required autoComplete="email" /><Field label="Phone (optional)" name="buyerPhone" type="tel" /><div className="space-y-1.5"><label htmlFor="message" className="block text-xs font-medium text-ink-700">Message *</label><textarea id="message" name="message" required minLength={10} rows={4} className="w-full rounded-[4px] border border-graphite-300 bg-paper-50 px-3 py-2.5 text-sm" /></div><div className="hidden" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div><p className="text-xs leading-5 text-ink-500">Sign in with a verified buyer account to keep this message in your enquiry history, or <Link href="/register/buyer" className="text-brand-700 underline underline-offset-4">create an account</Link>.</p><FormStatus status={status} /><ActionButton busy={busy}>Send enquiry</ActionButton></RegistryForm>;
}

export function PropertyEditor({ propertyId, initial, agencyMode = false }: { propertyId?: string; initial?: Record<string, unknown>; agencyMode?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus({ message: "Saving your listing…" });
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const files = data.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0);
      const imageObjectKeys: string[] = [];
      for (const file of files) {
        setStatus({ message: "Uploading listing photos…" });
        const signed = await sendJson("/api/media/upload-url", { fileName: file.name, contentType: file.type, sizeBytes: file.size });
        const upload = await fetch(signed.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
        if (!upload.ok) throw new Error("A listing photo could not be uploaded.");
        imageObjectKeys.push(signed.objectKey);
      }
      const optionalNumber = (name: string) => String(data.get(name) ?? "").trim() ? Number(data.get(name)) : undefined;
      const body = {
        title: data.get("title"), description: data.get("description"), propertyType: data.get("propertyType"),
        purpose: data.get("purpose"), priceAmount: optionalNumber("priceAmount"),
        priceCurrency: data.get("priceCurrency") || undefined, bedrooms: optionalNumber("bedrooms"),
        bathrooms: optionalNumber("bathrooms"), address: data.get("address") || undefined,
        suburb: data.get("suburb") || undefined, city: data.get("city"), province: data.get("province") || undefined,
        imageObjectKeys,
      };
      const endpoint = agencyMode ? "/api/agency/properties/" + propertyId + "/edit" : propertyId ? "/api/agent/properties/" + propertyId : "/api/agent/properties";
      const result = await sendJson(endpoint, body, propertyId ? "PUT" : "POST");
      setStatus({ message: "Your listing is published in the registry.", tone: "success" });
      if (!propertyId && result.slug) window.history.replaceState({}, "", "/agent/listings/" + result.id + "/edit");
    } catch (error) { setStatus({ message: error instanceof Error ? error.message : "Your listing could not be saved.", tone: "error" }); }
    finally { setBusy(false); }
  }
  return <RegistryForm onSubmit={submit}>
    <Field label="Listing title" name="title" required defaultValue={String(initial?.title ?? "")} />
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><label htmlFor="propertyType" className="block text-xs font-medium text-ink-700">Property type *</label><RegistrySelect id="propertyType" name="propertyType" required defaultValue={String(initial?.propertyType ?? "HOUSE")}><option value="HOUSE">House</option><option value="APARTMENT">Apartment</option><option value="TOWNHOUSE">Townhouse</option><option value="LAND">Land</option><option value="COMMERCIAL">Commercial</option><option value="FARM">Farm</option><option value="OTHER">Other</option></RegistrySelect></div>
      <div className="space-y-1.5"><label htmlFor="purpose" className="block text-xs font-medium text-ink-700">Listing purpose *</label><RegistrySelect id="purpose" name="purpose" required defaultValue={String(initial?.purpose ?? "SALE")}><option value="SALE">For sale</option><option value="RENT">For rent</option><option value="SHORT_STAY">Short stay</option></RegistrySelect></div></div>
    <div className="grid gap-4 sm:grid-cols-3"><Field label="Price" name="priceAmount" type="number" /><Field label="Currency" name="priceCurrency" defaultValue="USD" /><Field label="Bedrooms" name="bedrooms" type="number" /></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Bathrooms" name="bathrooms" type="number" /><Field label="Street address" name="address" defaultValue={String(initial?.address ?? "")} /></div>
    <div className="grid gap-4 sm:grid-cols-3"><Field label="Suburb" name="suburb" defaultValue={String(initial?.suburb ?? "")} /><Field label="City" name="city" required defaultValue={String(initial?.city ?? "")} /><Field label="Province" name="province" defaultValue={String(initial?.province ?? "")} /></div>
    <div className="space-y-1.5"><label htmlFor="description" className="block text-xs font-medium text-ink-700">Description *</label><textarea id="description" name="description" required minLength={30} rows={6} defaultValue={String(initial?.description ?? "")} className="w-full border border-graphite-300 bg-paper-50 px-3 py-2.5 text-sm" /></div>
    <div className="space-y-1.5"><label htmlFor="photos" className="block text-xs font-medium text-ink-700">Listing photos</label><input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="block w-full text-sm text-ink-500 file:mr-4 file:min-h-10 file:border file:border-graphite-300 file:bg-paper-100 file:px-3 file:text-xs file:font-medium" /><p className="text-xs text-ink-500">JPEG, PNG, WebP or AVIF, up to 12 MB each.</p></div>
    <FormStatus status={status} /><ActionButton busy={busy}>Save and publish listing</ActionButton>
  </RegistryForm>;
}

export function InvitationForm({ invitationType = "agency", canSend = true, canManage = true, canResend = true, disabledReason, manageMessage }: { invitationType?: "agency" | "subagent"; canSend?: boolean; canManage?: boolean; canResend?: boolean; disabledReason?: string; manageMessage?: string }) {
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<Status>(null); const [refreshKey, setRefreshKey] = useState(0);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const form = event.currentTarget; const data = new FormData(form); try { await sendJson("/api/agency/invitations", { email: data.get("email"), expiresInDays: 7, invitationType }); setStatus({ message: "The invitation has been queued for email delivery.", tone: "success" }); form.reset(); setRefreshKey((value) => value + 1); } catch (error) { setStatus({ message: error instanceof Error ? error.message : "The invitation could not be sent.", tone: "error" }); } finally { setBusy(false); } }
  return <>{canSend ? <RegistryForm onSubmit={submit}><Field label="Agent email address" name="email" type="email" required /><FormStatus status={status} /><ActionButton busy={busy}>Send invitation</ActionButton></RegistryForm> : disabledReason ? <p className="border border-graphite-200 bg-paper-100 p-3 text-xs leading-5 text-ink-600">{disabledReason}</p> : null}<AgentInvitationList invitationType={invitationType} refreshKey={refreshKey} canManage={canManage} canResend={canResend} manageMessage={manageMessage} /></>;
}

export function AgentResubmissionForm({ initial }: { initial: { fullName: string; eacRegistrationNumber: string; phone: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus({ message: "Submitting your corrected EAC details for review…" });
    const data = new FormData(event.currentTarget);
    try {
      await sendJson("/api/agent/profile/resubmit", {
        fullName: data.get("fullName"),
        eacRegistrationNumber: data.get("eacRegistrationNumber"),
        phone: data.get("phone"),
      });
      setStatus({ message: "Your corrected agent registration is awaiting review.", tone: "success" });
      router.refresh();
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : "Your registration could not be resubmitted.", tone: "error" });
    } finally { setBusy(false); }
  }
  return <RegistryForm onSubmit={submit}>
    <Field label="Full name" name="fullName" required autoComplete="name" defaultValue={initial.fullName} />
    <Field label="EAC registration number" name="eacRegistrationNumber" required pattern="EAC/[0-9]{4}/[0-9]{5}" hint="Use EAC/YYYY/NNNNN. Your corrected details will be reviewed again." defaultValue={initial.eacRegistrationNumber} />
    <Field label="Phone number" name="phone" type="tel" required pattern="\+[1-9][0-9]{1,14}" hint="International format, for example +263771234567." defaultValue={initial.phone} />
    <FormStatus status={status} />
    <ActionButton busy={busy}>Resubmit for EAC review</ActionButton>
  </RegistryForm>;
}

export function AdminMintForm({ agencies, agents }: {
  agencies: { id: string; name: string }[];
  agents: { id: string; fullName: string; eacRegistrationNumber: string; agencyId: string }[];
}) {
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<Status>(null); const [issued, setIssued] = useState<{ card: { serial: string }; activationCode: string | null } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget); try { const result = await sendJson("/api/admin/cards", { planCode: data.get("planCode"), agentProfileId: data.get("agentProfileId") || undefined, agencyId: data.get("agencyId") || undefined, reason: data.get("reason") }); setIssued(result); setStatus({ message: "The admin-minted card is ready for secure delivery.", tone: "success" }); } catch (error) { setStatus({ message: error instanceof Error ? error.message : "The card could not be minted.", tone: "error" }); } finally { setBusy(false); } }
  return <div className="space-y-4"><RegistryForm onSubmit={submit}><Field label="Card plan code" name="planCode" required hint="Choose an active plan code. Example: YEARLY or MONTHLY." /><label className="block space-y-1.5 text-xs font-medium text-ink-700">Agency (optional)<RegistrySelect name="agencyId" defaultValue=""><option value="">Platform inventory</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}</RegistrySelect></label><label className="block space-y-1.5 text-xs font-medium text-ink-700">Assign directly to an agent (optional)<RegistrySelect name="agentProfileId" defaultValue=""><option value="">Leave unassigned</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName} · {agent.eacRegistrationNumber}</option>)}</RegistrySelect></label><Field label="Minting reason" name="reason" required hint="This reason is recorded in the card audit history." /><p className="text-xs text-ink-500">Selecting an agent assigns the card and generates a one-time code. Unassigned inventory receives a code when an administrator assigns it.</p><FormStatus status={status} /><ActionButton busy={busy}>Mint admin card</ActionButton></RegistryForm>{issued ? <div className="space-y-2"><KeyIssued serial={issued.card.serial} message="Digital card minted." />{issued.activationCode ? <><p className="border border-graphite-300 bg-paper-100 p-3 font-mono text-xs">Activation code: <strong>{issued.activationCode}</strong></p><p className="text-xs text-ink-500">Copy this code to the intended agent now. It is only shown once.</p></> : <p className="text-xs text-ink-500">Unassigned inventory has no activation code yet. Assign it to an agent to create a one-time code.</p>}</div> : null}</div>;
}

export function CardPlanForm({ plan }: { plan?: { id: string; code: string; name: string; description?: string | null; durationDays: number; priceAmount?: string | null; currency: string; priceApproved: boolean; status: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<Status>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = {
        code: data.get("code"), name: data.get("name"), description: data.get("description") || undefined,
        durationDays: Number(data.get("durationDays")),
        priceAmount: String(data.get("priceAmount") ?? "").trim() ? Number(data.get("priceAmount")) : undefined,
        currency: data.get("currency"), priceApproved: data.get("priceApproved") === "on",
        status: data.get("status") === "on" ? "ACTIVE" : "DRAFT",
      };
      await sendJson(plan ? "/api/admin/card-plans/" + plan.id : "/api/admin/card-plans", result, plan ? "PUT" : "POST");
      setStatus({ message: plan ? "Card plan updated." : "Card plan created.", tone: "success" });
        router.refresh();
    } catch (error) { setStatus({ message: error instanceof Error ? error.message : "The card plan could not be saved.", tone: "error" }); }
    finally { setBusy(false); }
  }
  return <RegistryForm onSubmit={submit} className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Plan code" name="code" required defaultValue={plan?.code} /><Field label="Plan name" name="name" required defaultValue={plan?.name} /></div>
    <div className="grid gap-3 sm:grid-cols-3"><Field label="Duration in days" name="durationDays" type="number" required defaultValue={String(plan?.durationDays ?? 365)} /><Field label="Price amount" name="priceAmount" type="number" defaultValue={plan?.priceAmount ?? ""} hint="Keep blank while pricing is undecided." /><Field label="Currency" name="currency" required defaultValue={plan?.currency ?? "USD"} /></div>
    <div className="space-y-1.5"><label htmlFor={"plan-description-" + (plan?.id ?? "new")} className="block text-xs font-medium text-ink-700">Description</label><textarea id={"plan-description-" + (plan?.id ?? "new")} name="description" rows={2} defaultValue={plan?.description ?? ""} className="w-full border border-graphite-300 bg-paper-50 px-3 py-2 text-sm" /></div>
    <div className="flex flex-wrap gap-5 text-xs text-ink-700"><label className="inline-flex min-h-9 items-center gap-2"><input type="checkbox" name="priceApproved" defaultChecked={plan?.priceApproved ?? false} className="size-4 accent-brand-700" /> Approve this price for checkout</label><label className="inline-flex min-h-9 items-center gap-2"><input type="checkbox" name="status" defaultChecked={plan?.status === "ACTIVE" || !plan} className="size-4 accent-brand-700" /> Plan available</label></div>
    <FormStatus status={status} /><ActionButton busy={busy}>{plan ? "Save plan" : "Create plan"}</ActionButton>
  </RegistryForm>;
}

export function CheckoutButton({ planCode, label = "Continue to Paynow" }: { planCode: string; label?: string }) {
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<Status>(null);
  async function checkout() { setBusy(true); setStatus({ message: "Preparing your secure checkout…" }); try { const result = await sendJson("/api/payments/checkout", { planCode, idempotencyKey: crypto.randomUUID() }); setStatus({ message: "Taking you to Paynow…" }); window.location.assign(result.redirectUrl); } catch (error) { setStatus({ message: error instanceof Error ? error.message : "Checkout could not be started.", tone: "error" }); setBusy(false); } }
  return <div className="space-y-2"><button type="button" onClick={checkout} disabled={busy} className="min-h-11 border border-brand-700 bg-brand-700 px-5 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-60">{busy ? "Preparing checkout…" : label}</button><FormStatus status={status} /></div>;
}

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<Status>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await authClient.requestPasswordReset({ email: String(data.get("email")).trim().toLowerCase(), redirectTo: "/reset-password" });
      if (result.error) throw new Error(result.error.message ?? "A reset link could not be sent.");
      setStatus({ message: "If this address is registered, a secure reset link has been sent.", tone: "success" });
    } catch (error) { setStatus({ message: error instanceof Error ? error.message : "A reset link could not be sent.", tone: "error" }); }
    finally { setBusy(false); }
  }
  return <RegistryForm onSubmit={submit}><Field label="Account email" name="email" type="email" required autoComplete="email" /><FormStatus status={status} /><ActionButton busy={busy}>Send recovery link</ActionButton></RegistryForm>;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<Status>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus(null);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password.length < 12 || password.length > 128) { setStatus({ message: "Use a password between 12 and 128 characters.", tone: "error" }); setBusy(false); return; }
    if (password !== String(data.get("confirmPassword") ?? "")) { setStatus({ message: "Passwords do not match.", tone: "error" }); setBusy(false); return; }
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) throw new Error(result.error.message ?? "Your password could not be reset.");
      setStatus({ message: "Password updated. You can now sign in with your new password.", tone: "success" });
      window.setTimeout(() => router.replace("/login"), 1200);
    } catch (error) { setStatus({ message: error instanceof Error ? error.message : "Your password could not be reset.", tone: "error" }); }
    finally { setBusy(false); }
  }
  if (!token) return <FormStatus status={{ message: "This reset link is missing its token. Request a new recovery email.", tone: "error" }} />;
  return <RegistryForm onSubmit={submit}><Field label="New password" name="password" type="password" required autoComplete="new-password" hint="Use at least 12 characters." /><Field label="Confirm new password" name="confirmPassword" type="password" required autoComplete="new-password" /><FormStatus status={status} /><ActionButton busy={busy}>Update password</ActionButton></RegistryForm>;
}

export function ResendVerificationForm({ returnTo = "/workspace" }: { returnTo?: string }) {
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<Status>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget);
    try {
      const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/workspace";
      const callbackURL = "/verify-email?verified=1&returnTo=" + encodeURIComponent(safeReturnTo);
      const result = await authClient.sendVerificationEmail({ email: String(data.get("email")).trim().toLowerCase(), callbackURL });
      if (result.error) throw new Error(result.error.message ?? "A verification email could not be sent.");
      setStatus({ message: "If the account needs verification, a new email has been sent.", tone: "success" });
    } catch (error) { setStatus({ message: error instanceof Error ? error.message : "A verification email could not be sent.", tone: "error" }); }
    finally { setBusy(false); }
  }
  return <RegistryForm onSubmit={submit}><Field label="Account email" name="email" type="email" required autoComplete="email" /><FormStatus status={status} /><ActionButton busy={busy}>Send verification email</ActionButton></RegistryForm>;
}

export function TwoFactorSetup({ enabled = false }: { enabled?: boolean }) {
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<Status>(null); const [uri, setUri] = useState(""); const [manualSecret, setManualSecret] = useState(""); const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]); const [verified, setVerified] = useState(false); const [dialogOpen, setDialogOpen] = useState(false); const [copied, setCopied] = useState(false);
  async function enable(password: string) {
    setBusy(true); setStatus(null);
    try {
      const result = await authClient.twoFactor.enable({ password });
      if (result.error) throw new Error(result.error.message ?? "Two-factor setup failed.");
      if (result.data?.method !== "totp" || !result.data.totpURI) throw new Error("The authenticator setup details could not be prepared.");
      const secret = new URL(result.data.totpURI).searchParams.get("secret");
      if (!secret) throw new Error("The manual authenticator key could not be read.");
      setUri(result.data.totpURI); setManualSecret(secret); setBackupCodes(result.data.backupCodes ?? []); setDialogOpen(false);
      setStatus({ message: "Scan the QR code with your authenticator, then enter its current six-digit code." });
    } catch (error) { throw new Error(error instanceof Error ? error.message : "Two-factor setup failed."); }
    finally { setBusy(false); }
  }
  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus({ message: "Verifying authenticator code…" });
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
      if (result.error) throw new Error(result.error.message ?? "The code could not be verified.");
      setVerified(true); setStatus({ message: "Two-factor authentication is enabled for this account.", tone: "success" });
    } catch (error) { setStatus({ message: error instanceof Error ? error.message : "The code could not be verified.", tone: "error" }); }
    finally { setBusy(false); }
  }
  async function copySecret() {
    try { await navigator.clipboard.writeText(manualSecret); setCopied(true); }
    catch { setStatus({ message: "Clipboard access is unavailable. Select and copy the authenticator key manually.", tone: "error" }); }
  }
  async function copyBackupCodes() {
    try { await navigator.clipboard.writeText(backupCodes.join("\n")); setCopied(true); }
    catch { setStatus({ message: "Clipboard access is unavailable. Select and copy the recovery codes manually.", tone: "error" }); }
  }
  return <div className="space-y-4"><SecurityBanner />
    {enabled ? <div className="border border-graphite-200 bg-paper-100 p-4"><p className="font-medium text-ink-900">Authenticator enabled</p><p className="mt-1 text-xs leading-5 text-ink-500">Two-factor authentication is active for this account.</p></div> : !uri ? <button type="button" disabled={busy} onClick={() => setDialogOpen(true)} className="min-h-11 border border-brand-700 bg-brand-700 px-5 text-sm text-white">{busy ? "Preparing…" : "Set up authenticator"}</button> : <div className="space-y-5">
      <div className="mx-auto w-fit border border-graphite-300 bg-paper-100 p-3"><div className="border border-brand-700 bg-paper-50 p-4"><div className="mb-3 flex items-center justify-between gap-5"><span className="font-mono text-[10px] font-semibold uppercase tracking-[.12em] text-ink-700">Property Connect</span><span aria-hidden="true" className="grid size-7 place-items-center border border-brand-700 font-mono text-[9px] text-brand-800">PCZ</span></div><QRCodeSVG value={uri} size={208} level="M" bgColor="#fffdf8" fgColor="#111820" title="Property Connect authenticator setup QR code" /></div><p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[.14em] text-ink-500">Authenticator registration</p></div>
      <div className="border border-graphite-200 bg-paper-100 p-4"><p className="text-xs font-medium text-ink-800">Can&apos;t scan the QR code?</p><p className="mt-1 text-xs leading-5 text-ink-500">Enter this key manually in your authenticator app.</p><div className="mt-3 flex flex-wrap items-center gap-2"><code className="break-all border border-graphite-300 bg-paper-50 px-3 py-2 font-mono text-xs tracking-[.08em]">{manualSecret}</code><button type="button" onClick={copySecret} className="min-h-9 border border-graphite-300 px-3 text-xs font-medium hover:bg-paper-50">Copy key</button></div></div>
      <form onSubmit={verify} className="space-y-3"><label htmlFor="mfa-totp" className="block text-xs font-medium text-ink-700">Six-digit authenticator code<input id="mfa-totp" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} required className="mt-1.5 min-h-11 w-full rounded-[4px] border border-graphite-300 bg-paper-50 px-3 font-mono tracking-[.25em]" /></label><ActionButton busy={busy}>Verify and enable MFA</ActionButton></form>
      {verified && backupCodes.length ? <section className="border border-brand-700 bg-paper-100 p-4"><h3 className="font-deed text-xl text-ink-900">Save your recovery codes</h3><p className="mt-1 text-xs leading-5 text-ink-600">Each code can be used once if you lose access to your authenticator. Store them somewhere private.</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{backupCodes.map((backupCode) => <code key={backupCode} className="border border-graphite-300 bg-paper-50 px-2 py-2 text-center font-mono text-xs">{backupCode}</code>)}</div><button type="button" onClick={copyBackupCodes} className="mt-3 min-h-9 border border-graphite-300 px-3 text-xs font-medium hover:bg-paper-50">Copy recovery codes</button>{copied ? <span role="status" className="ml-3 text-xs text-ink-600">Copied.</span> : null}</section> : null}
    </div>}
    <FormStatus status={status} />
    {!enabled ? <DialogInput open={dialogOpen} title="Confirm your password" description="Re-enter your account password to prepare authenticator setup." label="Account password" submitLabel="Prepare QR code" type="password" busy={busy} onCancel={() => setDialogOpen(false)} onSubmit={enable} /> : null}
  </div>;
}
