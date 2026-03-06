import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, addDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const RequestDemoSection: React.FC = () => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    try {
      await addDoc(collection(db, "platformLeads"), {
        name: name.trim() || null,
        email: email.trim(),
        company: company.trim() || null,
        message: message.trim() || null,
        createdAt: new Date(),
      });
      setStatus("success");
      setName("");
      setEmail("");
      setCompany("");
      setMessage("");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section id="lead-form" className="py-[40px] md:py-[70px] bg-[#f9fafb] dark:bg-slate-800/50">
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="text-[32px] font-bold text-gray-900 dark:text-white text-center mb-3">
          {t("landing.requestDemoTitle")}
        </h2>
        <p className="text-base text-[#6b7280] dark:text-slate-400 text-center max-w-xl mx-auto mb-8">
          {t("landing.requestDemoSubtitle")}
        </p>
        <div className="max-w-md mx-auto">
          {status === "success" ? (
            <div className="p-6 rounded-[18px] border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-center">
              <p className="text-green-700 dark:text-green-300 font-medium">{t("landing.requestDemoSuccess")}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="p-6 rounded-[18px] border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t("landing.requestDemoLabelName")}</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white" placeholder={t("landing.requestDemoPlaceholderName")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t("landing.requestDemoLabelEmail")}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white" placeholder={t("landing.requestDemoPlaceholderEmail")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t("landing.requestDemoLabelCompany")}</label>
                <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white" placeholder={t("landing.requestDemoPlaceholderCompany")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t("landing.requestDemoLabelMessage")}</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white resize-none" placeholder={t("landing.requestDemoPlaceholderMessage")} />
              </div>
              {status === "error" && <p className="text-sm text-red-600">{t("landing.requestDemoError")}</p>}
              <button type="submit" disabled={status === "sending"} className="w-full px-5 py-3 rounded-[10px] font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50">
                {status === "sending" ? t("landing.requestDemoSending") : t("landing.ctaDemo")}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};

export default RequestDemoSection;
