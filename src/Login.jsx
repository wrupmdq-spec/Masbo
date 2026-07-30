import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import { signIn } from "./supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Email o contraseña incorrectos."
          : error.message
      );
    }
    // Si el login es correcto, el listener de sesión en App.jsx actualiza la pantalla solo.
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mb-3 border border-[#ab9574]/40 p-2 shadow-sm">
            <img src="/logo-gold.svg" alt="Mas Boronat" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-lg font-semibold text-stone-800 tracking-wide">Mas Boronat</h1>
          <p className="text-xs text-stone-400">Masía s. XVII · Salomó, Tarragona</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-stone-200 rounded-2xl p-6">
          <label className="block mb-3">
            <span className="block text-xs font-medium text-stone-500 mb-1">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ab9574] focus:border-[#ab9574]"
              placeholder="tucorreo@masboronat.com"
            />
          </label>
          <label className="block mb-4">
            <span className="block text-xs font-medium text-stone-500 mb-1">Contraseña</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {loading ? "Entrando…" : "Iniciar sesión"}
          </button>
        </form>

        <p className="text-center text-xs text-stone-400 mt-4">
          ¿No tienes cuenta? Pídesela al administrador — las cuentas del personal se crean manualmente.
        </p>
      </div>
    </div>
  );
}

