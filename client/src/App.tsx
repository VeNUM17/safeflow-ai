import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { SafetyDisclaimerBanner } from './components/SafetyDisclaimerBanner';
import { ProjectDashboard } from './components/ProjectDashboard';
import { PsiReviewWorkspace } from './components/PsiReviewWorkspace';
import { PidGraphViewer } from './components/PidGraphViewer';
import { DocumentsView } from './components/DocumentsView';
import { DocumentUploadModal } from './components/DocumentUploadModal';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { ExportModal } from './components/ExportModal';
import { NewProjectModal } from './components/NewProjectModal';
import { ManualChemicalModal } from './components/ManualChemicalModal';
import {
  ProcessProject,
  ProjectDashboardSummary,
  ChemicalRecord,
  DocumentRecord,
  ChemicalConflict,
  EquipmentTag,
  PipingLine,
  TopologyGraph,
  ReviewStatus,
} from './types';

export const App: React.FC = () => {
  const [projects, setProjects] = useState<ProcessProject[]>([]);
  const [currentProject, setCurrentProject] = useState<ProcessProject | null>(null);
  const [summary, setSummary] = useState<ProjectDashboardSummary | null>(null);
  const [chemicals, setChemicals] = useState<ChemicalRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [conflicts, setConflicts] = useState<ChemicalConflict[]>([]);
  const [equipment, setEquipment] = useState<EquipmentTag[]>([]);
  const [lines, setLines] = useState<PipingLine[]>([]);
  const [graph, setGraph] = useState<TopologyGraph | null>(null);
  const [selectedChemicalId, setSelectedChemicalId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'workspace' | 'pid-graph' | 'documents'>('workspace');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isConflictsOpen, setIsConflictsOpen] = useState(false);
  const [isManualChemicalModalOpen, setIsManualChemicalModalOpen] = useState(false);
  const [editingChemical, setEditingChemical] = useState<ChemicalRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch initial projects
  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const json = await res.json();
      if (json.success && json.data.length > 0) {
        setProjects(json.data);
        if (!currentProject) {
          setCurrentProject(json.data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  };

  // 2. Fetch full project data
  const loadProjectData = useCallback(async (projectId: string) => {
    setIsLoading(true);
    try {
      const [projRes, chemsRes, docsRes, confRes, pidRes, graphRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/chemicals`),
        fetch(`/api/projects/${projectId}/documents`),
        fetch(`/api/projects/${projectId}/conflicts`),
        fetch(`/api/projects/${projectId}/pid/elements`),
        fetch(`/api/projects/${projectId}/graph`),
      ]);

      const [projJson, chemsJson, docsJson, confJson, pidJson, graphJson] = await Promise.all([
        projRes.json(),
        chemsRes.json(),
        docsRes.json(),
        confRes.json(),
        pidRes.json(),
        graphRes.json(),
      ]);

      if (projJson.success) {
        setCurrentProject(projJson.data.project);
        setSummary(projJson.data.summary);
      }
      if (chemsJson.success) {
        setChemicals(chemsJson.data);
        if (chemsJson.data.length > 0 && !selectedChemicalId) {
          setSelectedChemicalId(chemsJson.data[0].id);
        }
      }
      if (docsJson.success) {
        setDocuments(docsJson.data);
      }
      if (confJson.success) {
        setConflicts(confJson.data);
      }
      if (pidJson.success) {
        setEquipment(pidJson.data.equipment);
        setLines(pidJson.data.lines);
      }
      if (graphJson.success) {
        setGraph(graphJson.data);
      }
    } catch (err) {
      console.error('Error loading project details:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedChemicalId]);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (currentProject) {
      loadProjectData(currentProject.id);
    }
  }, [currentProject?.id, loadProjectData]);

  // Project Switch
  const handleSelectProject = (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (proj) {
      setCurrentProject(proj);
      setSelectedChemicalId(null);
    }
  };

  // Create Project
  const handleCreateProject = async (name: string, description: string) => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    const json = await res.json();
    if (json.success) {
      setProjects((prev) => [...prev, json.data]);
      setCurrentProject(json.data);
      setSelectedChemicalId(null);
    }
  };

  // Manual Chemical Actions
  const handleOpenCreateChemical = () => {
    setEditingChemical(null);
    setIsManualChemicalModalOpen(true);
  };

  const handleOpenEditChemical = (chem: ChemicalRecord) => {
    setEditingChemical(chem);
    setIsManualChemicalModalOpen(true);
  };

  const handleSaveManualChemical = async (payload: any, isDraft: boolean) => {
    if (!currentProject) return;

    if (editingChemical) {
      // Updating existing chemical
      const res = await fetch(`/api/chemicals/${editingChemical.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to update chemical');
      }
      await loadProjectData(currentProject.id);
      setSelectedChemicalId(editingChemical.id);
    } else {
      // Creating new manual chemical
      const res = await fetch(`/api/projects/${currentProject.id}/chemicals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to create chemical');
      }
      await loadProjectData(currentProject.id);
      if (json.data && json.data.id) {
        setSelectedChemicalId(json.data.id);
      }
    }
  };

  // Update Field
  const handleUpdateField = async (
    chemicalId: string,
    fieldKey: string,
    updates: {
      user_value?: string | null;
      review_status: ReviewStatus;
      notes?: string;
    }
  ) => {
    const res = await fetch(`/api/chemicals/${chemicalId}/fields/${fieldKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const json = await res.json();
    if (json.success) {
      // Update local chemical record
      setChemicals((prev) =>
        prev.map((c) => (c.id === chemicalId ? json.data.chemical : c))
      );
      if (json.data.summary) {
        setSummary(json.data.summary);
      }
      // Refresh conflicts & graph
      if (currentProject) {
        const [confRes, graphRes] = await Promise.all([
          fetch(`/api/projects/${currentProject.id}/conflicts`),
          fetch(`/api/projects/${currentProject.id}/graph`),
        ]);
        const [confJson, graphJson] = await Promise.all([confRes.json(), graphRes.json()]);
        if (confJson.success) setConflicts(confJson.data);
        if (graphJson.success) setGraph(graphJson.data);
      }
    }
  };

  // Resolve Conflict
  const handleResolveConflict = async (
    conflictId: string,
    resolvedValue: string,
    resolutionNotes: string
  ) => {
    const res = await fetch(`/api/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resolved_value: resolvedValue,
        resolution_notes: resolutionNotes,
      }),
    });
    const json = await res.json();
    if (json.success && currentProject) {
      await loadProjectData(currentProject.id);
    }
  };

  // Equipment & Piping updates
  const handleUpdateEquipment = async (tagId: string, updates: any) => {
    const res = await fetch(`/api/equipment/${tagId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const json = await res.json();
    if (json.success && currentProject) {
      setEquipment((prev) => prev.map((e) => (e.id === tagId ? json.data : e)));
      const graphRes = await fetch(`/api/projects/${currentProject.id}/graph`);
      const graphJson = await graphRes.json();
      if (graphJson.success) setGraph(graphJson.data);
    }
  };

  const handleUpdateLine = async (lineId: string, updates: any) => {
    const res = await fetch(`/api/lines/${lineId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const json = await res.json();
    if (json.success && currentProject) {
      setLines((prev) => prev.map((l) => (l.id === lineId ? json.data : l)));
      const graphRes = await fetch(`/api/projects/${currentProject.id}/graph`);
      const graphJson = await graphRes.json();
      if (graphJson.success) setGraph(graphJson.data);
    }
  };

  const handleAddEquipment = async (newTag: any) => {
    if (!currentProject) return;
    const res = await fetch(`/api/projects/${currentProject.id}/equipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTag),
    });
    const json = await res.json();
    if (json.success) {
      setEquipment((prev) => [...prev, json.data]);
      await loadProjectData(currentProject.id);
    }
  };

  const handleDeleteEquipment = async (tagId: string, reviewer?: string, reason?: string) => {
    if (!currentProject) return;
    const res = await fetch(`/api/equipment/${tagId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewer, reason }),
    });
    const json = await res.json();
    if (json.success) {
      await loadProjectData(currentProject.id);
    }
  };

  const handleAddLine = async (newLine: any) => {
    if (!currentProject) return;
    const res = await fetch(`/api/projects/${currentProject.id}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLine),
    });
    const json = await res.json();
    if (json.success) {
      setLines((prev) => [...prev, json.data]);
      await loadProjectData(currentProject.id);
    }
  };

  const handleDeleteLine = async (lineId: string, reviewer?: string, reason?: string) => {
    if (!currentProject) return;
    const res = await fetch(`/api/lines/${lineId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewer, reason }),
    });
    const json = await res.json();
    if (json.success) {
      await loadProjectData(currentProject.id);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success && currentProject) {
        await loadProjectData(currentProject.id);
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      {/* 1. Safety Regulatory Scope Banner */}
      <SafetyDisclaimerBanner isSample={currentProject?.is_sample} />

      {/* 2. Main Header */}
      <Header
        projects={projects}
        currentProject={currentProject}
        summary={summary}
        onSelectProject={handleSelectProject}
        onOpenNewProjectModal={() => setIsNewProjectOpen(true)}
        onOpenUploadModal={() => setIsUploadOpen(true)}
        onOpenManualChemicalModal={handleOpenCreateChemical}
        onOpenExportModal={() => setIsExportOpen(true)}
        onOpenConflictsModal={() => setIsConflictsOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* 3. Dashboard KPI Overview & Completeness Meter */}
      <ProjectDashboard
        summary={summary}
        chemicals={chemicals}
        onOpenConflictsModal={() => setIsConflictsOpen(true)}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* 4. Active Content Tab */}
      <main className="flex-1">
        {isLoading ? (
          <div className="max-w-7xl mx-auto py-24 text-center text-slate-500 text-xs font-mono">
            Loading OSHA Process Safety Information records...
          </div>
        ) : activeTab === 'workspace' ? (
          <PsiReviewWorkspace
            chemicals={chemicals}
            selectedChemicalId={selectedChemicalId}
            onSelectChemical={setSelectedChemicalId}
            onUpdateField={handleUpdateField}
            statusFilter={statusFilter}
            searchQuery={searchQuery}
            onOpenManualChemicalModal={handleOpenCreateChemical}
            onEditChemical={handleOpenEditChemical}
          />
        ) : activeTab === 'pid-graph' ? (
          <PidGraphViewer
            projectId={currentProject?.id || ''}
            equipment={equipment}
            lines={lines}
            chemicals={chemicals}
            documents={documents}
            graph={graph}
            summary={summary}
            conflicts={conflicts}
            onOpenConflictsModal={() => setIsConflictsOpen(true)}
            onUpdateEquipment={handleUpdateEquipment}
            onDeleteEquipment={handleDeleteEquipment}
            onAddEquipment={handleAddEquipment}
            onAddLine={handleAddLine}
            onUpdateLine={handleUpdateLine}
            onDeleteLine={handleDeleteLine}
            onRefreshGraph={async () => {
              if (currentProject) {
                const res = await fetch(`/api/projects/${currentProject.id}/graph`);
                const json = await res.json();
                if (json.success) setGraph(json.data);
              }
            }}
            onRefreshProject={async () => {
              if (currentProject) await loadProjectData(currentProject.id);
            }}
          />
        ) : (
          <DocumentsView
            documents={documents}
            onOpenUploadModal={() => setIsUploadOpen(true)}
            onDeleteDocument={handleDeleteDocument}
          />
        )}
      </main>

      {/* Modals */}
      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        projectId={currentProject?.id || ''}
        onUploadSuccess={async () => {
          if (currentProject) await loadProjectData(currentProject.id);
        }}
      />

      <ConflictResolutionModal
        isOpen={isConflictsOpen}
        onClose={() => setIsConflictsOpen(false)}
        conflicts={conflicts}
        onResolveConflict={handleResolveConflict}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        project={currentProject}
      />

      <NewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        onCreateProject={handleCreateProject}
      />

      <ManualChemicalModal
        isOpen={isManualChemicalModalOpen}
        onClose={() => {
          setIsManualChemicalModalOpen(false);
          setEditingChemical(null);
        }}
        projectId={currentProject?.id || ''}
        existingChemicals={chemicals}
        initialChemical={editingChemical}
        onSave={handleSaveManualChemical}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-[11px] text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>OSHA 29 CFR 1910.119(d)(1) Process Safety Information Identification Engine</span>
          <span>Qualified Process Safety Engineer Sign-Off Mandatory</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
