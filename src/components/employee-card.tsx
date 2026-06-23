"use client";

import { asText, asNumber, formatCurrency, presentLabel, paymentHistoryLines, paymentHistoryTotalPaid } from "./enxt-brain-app";
import type { BrainDocument, EmployeePayment } from "../lib/types";
import { Pencil } from "lucide-react";

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: "green" | "amber" | "neutral" }) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

export default function EmployeeCard({
  employee,
  onEdit,
}: {
  employee: BrainDocument;
  onEdit: (employee: BrainDocument) => void;
}) {
  const paymentHistory = employee.fields.paymentHistory as EmployeePayment[] | undefined;
  const name = asText(employee, "name");
  const designation = asText(employee, "designation") || "AI Engineer";
  const email = asText(employee, "email") || `${name.toLowerCase().replace(/\s+/g, "")}@inext.ai`;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <strong>{name}</strong>
          <span style={{ display: "block", fontSize: "0.8rem", color: "var(--muted)", marginTop: "2px" }}>{designation}</span>
        </div>
        <StatusBadge tone={asText(employee, "status") === "Exited" ? "amber" : "green"}>
          {asText(employee, "status")}
        </StatusBadge>
      </div>
      <div className="card-body">
        <div className="card-item">
          <span>Email:</span>
          <span style={{ fontSize: "0.85rem", color: "var(--muted)", wordBreak: "break-all" }}>{email}</span>
        </div>
        <div className="card-item">
          <span>Department:</span>
          <span>{asText(employee, "department")}</span>
        </div>
        <div className="card-item">
          <span>Salary:</span>
          <span>{formatCurrency(asNumber(employee, "monthlySalaryInr"))}</span>
        </div>
        <div className="card-item">
          <span>Paid:</span>
          <span>
            {paymentHistoryLines(paymentHistory).length > 0
              ? formatCurrency(paymentHistoryTotalPaid(paymentHistory))
              : "No records"}
          </span>
        </div>
        <div className="card-item">
          <span>Payments:</span>
          <span>{paymentHistoryLines(paymentHistory).length}</span>
        </div>
        <div className="card-item">
          <span>Joined:</span>
          <span>{asText(employee, "dateOfJoining")}</span>
        </div>
        <div className="card-item">
          <span>Left:</span>
          <span>{presentLabel(asText(employee, "dateOfLeaving"))}</span>
        </div>
      </div>
      <div className="card-footer">
        <button className="row-action-button" onClick={() => onEdit(employee)} type="button">
          <Pencil size={15} aria-hidden="true" />
          <span>Edit</span>
        </button>
      </div>
    </div>
  );
}
