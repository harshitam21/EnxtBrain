"use client";

import { asText, asNumber, formatCurrency, getProjectDeliveryStatus, getProjectStatusTone } from "./enxt-brain-app";
import { BrainDocument } from "../lib/types";
import { FileText } from "lucide-react";

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: "green" | "amber" | "neutral" }) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

export default function ProjectCard({
  project,
  onSelect,
}: {
  project: BrainDocument;
  onSelect: (project: BrainDocument) => void;
}) {
  const status = getProjectDeliveryStatus(project);
  const progress = asNumber(project, "progress");

  return (
    <div className="card">
      <div className="card-header">
        <strong>{project.title}</strong>
        <StatusBadge tone={getProjectStatusTone(status)}>{status}</StatusBadge>
      </div>
      <div className="card-body">
        <div className="card-item">
          <span>Client:</span>
          <span>{asText(project, "client")}</span>
        </div>
        <div className="card-item">
          <span>Health:</span>
          <div className="health-container">
            <span className={`health-pulse ${asText(project, "health").toLowerCase()}`} />
            <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{asText(project, "health")}</span>
          </div>
        </div>
        <div className="card-item">
          <span>Owner:</span>
          <span>{asText(project, "owner")}</span>
        </div>
        <div className="card-item">
          <span>Due:</span>
          <span>{asText(project, "dueDate")}</span>
        </div>
        <div className="card-item">
          <span>Budget:</span>
          <span>{formatCurrency(asNumber(project, "budgetInr"))}</span>
        </div>
        <div className="card-item">
          <span>Progress:</span>
          <div style={{ width: "100%", marginTop: "4px" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{progress}%</span>
            <div className="progress-bar-container" aria-label={`${project.title} progress`}>
              <div
                className={`progress-bar-fill ${progress < 35 ? "red" : progress < 75 ? "amber" : ""}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="card-footer">
        <button className="row-action-button" onClick={() => onSelect(project)} type="button">
          <FileText size={15} aria-hidden="true" />
          <span>Open</span>
        </button>
      </div>
    </div>
  );
}
