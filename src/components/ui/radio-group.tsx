// src/components/ui/radio-group.tsx
import * as React from "react";

interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: any) => void;
}

export const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ value, onValueChange, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="radiogroup"
        data-value={value}
        {...props}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onValueChange(e.target.value)
        }
      >
        {children}
      </div>
    );
  }
);
RadioGroup.displayName = "RadioGroup";

interface RadioGroupItemProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ id, value, ...props }, ref) => (
    <input
      type="radio"
      id={id}
      name="tripType"
      value={value}
      ref={ref}
      {...props}
    />
  )
);
RadioGroupItem.displayName = "RadioGroupItem";
