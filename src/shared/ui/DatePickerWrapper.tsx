// ✅ src/components/ui/DatePickerWrapper.tsx

import React from 'react';
import DatePicker from 'react-datepicker';
import { fr } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';

interface DatePickerWrapperProps {
  value?: [Date, Date];
  onRangeChange: (range: [Date, Date]) => void;
  className?: string;
}

const DatePickerWrapper: React.FC<DatePickerWrapperProps> = ({
  value,
  onRangeChange,
  className,
}) => {
  return (
    <DatePicker
      selectsRange
      startDate={value?.[0]}
      endDate={value?.[1]}
      onChange={(update) => onRangeChange(update as [Date, Date])}
      dateFormat="dd/MM/yyyy"
      locale={fr}
      portalId="root-portal"
      popperPlacement="bottom-end"
      className={className || 'date-picker'}
    />
  );
};

export default DatePickerWrapper;
