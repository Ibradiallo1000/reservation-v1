import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "link"; // ajoute les variantes que tu utilises
  size?: "default" | "sm" | "lg" | "icon";             // tailles disponibles
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => {
    // Ajoute ici les styles selon les variantes si tu veux aller plus loin
    const variantClass = {
      default: "bg-blue-600 text-white hover:bg-blue-700",
      outline: "border border-gray-300 text-gray-700 bg-white hover:bg-gray-50",
      ghost: "bg-transparent text-gray-700 hover:bg-gray-100",
      link: "text-blue-600 underline hover:text-blue-800"
    }[variant];

    const sizeClass = {
      default: "h-10 px-4 py-2 text-sm",
      sm: "h-8 px-3 text-sm",
      lg: "h-12 px-6 text-base",
      icon: "h-10 w-10"
    }[size];

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-md font-medium transition ${variantClass} ${sizeClass} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
