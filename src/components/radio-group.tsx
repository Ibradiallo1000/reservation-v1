// radio-group.tsx
export const RadioGroup = ({ children, ...props }) => <div {...props}>{children}</div>;
export const RadioGroupItem = ({ id, value }) => (
  <input type="radio" id={id} name="tripType" value={value} className="accent-blue-600" />
);