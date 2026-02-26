import React, { useEffect, useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";

export type ToastType = "success" | "error";

interface Props {
  message: string;
  visible: boolean;
  primaryColor: string;
  type?: ToastType;
}

export const SuccessToast: React.FC<Props> = ({ message, visible, primaryColor, type = "success" }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setShow(true);
    } else {
      const t = setTimeout(() => setShow(false), 300);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!show && !visible) return null;

  const isError = type === "error";
  const bg = isError
    ? "linear-gradient(135deg, #DC2626, #DC2626DD)"
    : `linear-gradient(135deg, ${primaryColor}, ${primaryColor}DD)`;
  const border = isError ? "#DC262660" : `${primaryColor}60`;

  return (
    <div
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
      }`}
    >
      <div
        className="flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl border text-white"
        style={{ background: bg, borderColor: border }}
      >
        {isError
          ? <XCircle className="w-5 h-5 shrink-0" />
          : <CheckCircle className="w-5 h-5 shrink-0" />
        }
        <p className="text-sm font-medium">{message}</p>
      </div>
    </div>
  );
};
