import React, { useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { updatePassword, markPasswordChanged } from "./supabaseClient";
import { useTranslation } from "./i18n.jsx";

export default function SetPassword({ email, onDone }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t("setpw_tooshort"));
      return;
    }
    if (password !== confirm) {
      setError(t("setpw_mismatch"));
      return;
    }

    setLoading(true);
    const { error: updateError } = await updatePassword(password);
    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }
    await markPasswordChanged();
    setLoading(false);
    onDone();
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center mb-3 border border-[#ab9574]/40 shadow-sm">
            <ShieldCheck size={26} className="text-[#806c4d]" />
          </div>
          <h1 className="text-lg font-semibold text-stone-800 tracking-wide">{t("setpw_title")}</h1>
          <p className="text-xs text-stone-400 text-center mt-1">
            {email} {t("setpw_subtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-stone-200 rounded-2xl p-6">
          <label className="block mb-3">
            <span className="block text-xs font-medium text-stone-500 mb-1">{t("setpw_new")}</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ab9574] focus:border-[#ab9574]"
              placeholder={t("setpw_min")}
            />
          </label>
          <label className="block mb-4">
            <span className="block text-xs font-medium text-stone-500 mb-1">{t("setpw_repeat")}</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ab9574] focus:border-[#ab9574]"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <div className="mb-4 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#806c4d] hover:bg-[#6d5c42] disabled:opacity-60 text-white font-medium rounded-xl text-sm py-2.5 flex items-center justify-center gap-2"
          >
            {loading && <RefreshCw size={14} className="animate-spin" />}
            {loading ? t("setpw_saving") : t("setpw_save")}
          </button>
        </form>
      </div>
    </div>
  );
}
