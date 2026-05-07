export const mockCase = {
  caseInfo: {
    id: '2024-GA-882',
    version: 'V2.1',
    courtName: 'Superior Court of Justice',
    parties: 'Department of Justice (Plaintiff) vs Meridian Corp. (Defendant)',
    summary:
      'Violation of Section 12-B Environmental Compliance. Penalties assessed based on fiscal negligence across three subsidiaries.',
    criticalDeadline: 'Oct 15, 2024',
    status: 'In Review',
    assignedUnit: 'Regulatory Bureau',
  },
  aiRecommendation: {
    actionType: 'Compliance',
    priority: 'High',
    authority: 'Regulatory Bureau',
    deadline: 'Oct 20, 2024',
    confidence: 94,
  },
  impactAnalysis: {
    riskLevel: 'Medium',
    legalImpact: 'Significant',
    financialExposure: '$2.4M Estimated',
    finalDeadline: 'Oct 30, 2024',
  },
  actionPlan: [
    {
      step: 1,
      task: 'Data collection from Meridian HQ',
      assignedTo: 'A. Smith',
      deadline: 'Oct 05, 2024',
      status: 'Complete',
    },
    {
      step: 2,
      task: 'Draft initial reasoning document',
      assignedTo: 'L. Ross',
      deadline: 'Oct 12, 2024',
      status: 'In Progress',
    },
    {
      step: 3,
      task: 'Final review and compliance check',
      assignedTo: 'Unassigned',
      deadline: 'Oct 20, 2024',
      status: 'Pending',
    },
  ],
}
