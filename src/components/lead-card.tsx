"use client";

import { asText, asNumber, formatCurrency, presentLabel } from "./enxt-brain-app";
import { BrainDocument } from "../lib/types";
import { Pencil } from "lucide-react";

function LeadPipelineProgress({ currentStage }: { currentStage: string }) {
  const stages = ["Old Leads", "Contacts", "Proposal", "Project Started", "Completed"];
  const currentIndex = stages.indexOf(currentStage);

  return (
    <div style={{ marginTop: "6px", width: "100%" }}>
      <div className="pipeline-tracker">
        {stages.map((stage, idx) => (
          <div
            key={stage}
            className={`pipeline-step ${idx <= currentIndex ? "active" : ""}`}
            title={stage}
          />
        ))}
      </div>
      <span className="pipeline-step-label">Stage: {currentStage}</span>
    </div>
  );
}

export default function LeadCard({
  lead,
  onEdit,
}: {
  lead: BrainDocument;
  onEdit: (lead: BrainDocument) => void;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <strong>{asText(lead, "company")}</strong>
        <span>{asText(lead, "stage")}</span>
      </div>
      <div className="card-body">
        <div className="card-item">
          <span>Contact:</span>
          <span>{presentLabel(asText(lead, "contactPerson"))}</span>
        </div>
        <div className="card-item">
          <span>Value:</span>
          <span>
            {asNumber(lead, "potentialValueInr")
              ? formatCurrency(asNumber(lead, "potentialValueInr"))
              : presentLabel(asText(lead, "contractValue"))}
          </span>
        </div>
        <div className="card-item">
          <span>Next Step:</span>
          <span>{presentLabel(asText(lead, "nextSteps"))}</span>
        </div>
        <div className="card-item">
          <span>Due:</span>
          <span>{presentLabel(asText(lead, "deadline"))}</span>
        </div>
        <div className="card-item" style={{ display: "block", paddingTop: "4px" }}>
          <LeadPipelineProgress currentStage={asText(lead, "stage")} />
        </div>
      </div>
      <div className="card-footer">
        <button className="row-action-button" onClick={() => onEdit(lead)} type="button">
          <Pencil size={15} aria-hidden="true" />
          <span>Edit</span>
        </button>
      </div>
    </div>
  );
}
