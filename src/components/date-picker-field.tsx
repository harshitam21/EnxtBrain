"use client";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

interface DatePickerFieldProps {
  label: string;
  selectedDate: string;
  onChange: (date: string) => void;
}

export default function DatePickerField({
  label,
  selectedDate,
  onChange,
}: DatePickerFieldProps) {
  const handleDateChange = (date: Date | null) => {
    if (date) {
      onChange(date.toISOString().slice(0, 10));
    } else {
      onChange("");
    }
  };

  return (
    <label className="field-control">
      <span>{label}</span>
      <DatePicker
        selected={selectedDate && new Date(selectedDate).toString() !== "Invalid Date" ? new Date(selectedDate) : null}
        onChange={handleDateChange}
        dateFormat="yyyy-MM-dd"
        className="input"
      />
    </label>
  );
}
