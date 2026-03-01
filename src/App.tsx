/// <reference types="vite/client" />
import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  BookOpen, 
  Users, 
  Plus, 
  Search, 
  Filter, 
  ChevronRight, 
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  AlertCircle, 
  CheckCircle2, 
  Clock,
  MoreVertical,
  ArrowLeft,
  Calendar,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  X,
  Edit2,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
import { 
  format, 
  isAfter, 
  parseISO, 
  startOfDay, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isToday
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn, BOOK_STAGES, ProjectStatus, type Project, type Editor, type Stage, type StageName, type Group } from './types';
import { supabase as initialSupabase, isConfigured as initialIsConfigured } from './lib/supabase';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';

// --- Constants ---
const GROUPS: Group[] = ['绘本组', '科普组', '文学组', '其他组'];
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// --- Components ---

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem('book_projects');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to load projects from localStorage', e);
      return [];
    }
  });

  const [editors, setEditors] = useState<Editor[]>(() => {
    try {
      const saved = localStorage.getItem('book_editors');
      if (saved) return JSON.parse(saved);
      return [
        { id: '1', name: '张三', group: '绘本组' },
        { id: '2', name: '李四', group: '科普组' },
        { id: '3', name: '王五', group: '文学组' }
      ];
    } catch (e) {
      console.error('Failed to load editors from localStorage', e);
      return [];
    }
  });

  const [activeTab, setActiveTab] = useState<'dashboard' | 'projects' | 'editors'>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingEditor, setEditingEditor] = useState<Editor | null>(null);
  const [projectFilters, setProjectFilters] = useState<{ status?: string, editorId?: string } | undefined>(undefined);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [supabaseClient] = useState(initialSupabase);
  const [isSupabaseConfigured] = useState(initialIsConfigured);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setConfigError('未检测到 Supabase 环境变量。请在 Vercel 设置中添加 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。');
    } else {
      setConfigError(null);
    }
  }, [isSupabaseConfigured]);

  const fetchFromCloud = async () => {
    if (!isSupabaseConfigured || !supabaseClient) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      console.log('Fetching data from Supabase...');
      
      // 1. Fetch Editors
      const { data: editorsData, error: editorsError } = await supabaseClient.from('editors').select('*');
      if (editorsError) {
        console.error('Error fetching editors:', editorsError);
        throw editorsError;
      }
      
      // 2. Fetch Projects
      const { data: projectsData, error: projectsError } = await supabaseClient.from('projects').select('*');
      if (projectsError) {
        console.error('Error fetching projects:', projectsError);
        throw projectsError;
      }

      // 3. Fetch Process Nodes
      const { data: nodesData, error: nodesError } = await supabaseClient.from('process_nodes').select('*');
      if (nodesError) {
        console.error('Error fetching process nodes:', nodesError);
        throw nodesError;
      }

      console.log(`Fetched: ${editorsData?.length} editors, ${projectsData?.length} projects, ${nodesData?.length} nodes`);

      if (editorsData && editorsData.length > 0) {
        setEditors(editorsData.map(e => ({
          id: e.id,
          name: e.name,
          group: e.group as Group
        })));
      }

      if (projectsData) {
        const mappedProjects: Project[] = projectsData.map(p => {
          // Find nodes for this project
          const pNodes = nodesData?.filter(n => n.project_id === p.id) || [];
          // Sort by order
          pNodes.sort((a, b) => a.order_index - b.order_index);
          
          // Map nodes to stages
          let stages: Stage[] = pNodes.map(n => ({
            name: n.node_name as StageName,
            plannedDate: n.planned_date || '',
            status: n.is_completed ? '已完成' : '进行中'
          }));

          // Fallback if no nodes found (e.g. new project or sync error)
          if (stages.length === 0) {
             stages = BOOK_STAGES.map(name => ({ name, plannedDate: '', status: '进行中' }));
          }

          return {
            id: p.id,
            name: p.title, // Map title -> name
            group: (p.group_type) as Group,
            editorIds: p.owner_ids || [], // Map owner_ids -> editorIds
            riskIssues: p.risk_notes || '', // Map risk_notes -> riskIssues
            stages: stages,
            createdAt: p.created_at
          };
        });
        setProjects(mappedProjects);
      }
      setLastSync(new Date());
    } catch (e: any) {
      console.error('Failed to fetch from Supabase:', e);
      setSyncError(e.message || '同步失败');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (isSupabaseConfigured && supabaseClient) {
      fetchFromCloud();
    }
  }, [isSupabaseConfigured, supabaseClient]);

  const handleNavigateToProjects = (filters: { status?: string, editorId?: string }) => {
    setProjectFilters(filters);
    setActiveTab('projects');
    setSelectedProjectId(null);
  };

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('book_projects', JSON.stringify(projects));
    
    // Sync to Supabase
    if (isSupabaseConfigured && supabaseClient && projects.length > 0) {
      const syncProjects = async () => {
        console.log('Syncing projects and nodes...');
        
        // 1. Prepare Projects Payload
        const projectsPayload = projects.map(p => {
          const storageStage = p.stages.find(s => s.name === '入库');
          return {
            id: p.id,
            title: p.name, // Map name -> title
            group_type: p.group,
            owner_ids: p.editorIds, // Map editorIds -> owner_ids
            risk_notes: p.riskIssues, // Map riskIssues -> risk_notes
            target_storage_date: storageStage ? storageStage.plannedDate || null : null,
            created_at: p.createdAt
          };
        });

        // 2. Prepare Process Nodes Payload
        const nodesPayload = projects.flatMap(p => 
          p.stages.map((s, index) => ({
            id: `${p.id}_${index}`, // Deterministic ID: projectID_index
            project_id: p.id,
            node_name: s.name,
            order_index: index,
            planned_date: s.plannedDate || null,
            is_completed: s.status === '已完成'
          }))
        );

        // 3. Upsert Projects
        const { error: projError } = await supabaseClient.from('projects').upsert(projectsPayload);
        if (projError) {
          console.error('Sync Projects Error:', projError);
          return; // Stop if projects fail
        }

        // 4. Upsert Nodes
        const { error: nodeError } = await supabaseClient.from('process_nodes').upsert(nodesPayload);
        if (nodeError) {
          console.error('Sync Nodes Error:', nodeError);
        } else {
          console.log('Sync Complete: Projects & Nodes');
        }
      };
      
      syncProjects();
    }
  }, [projects, isSupabaseConfigured, supabaseClient]);

  useEffect(() => {
    localStorage.setItem('book_editors', JSON.stringify(editors));

    // Sync to Supabase
    if (isSupabaseConfigured && supabaseClient && editors.length > 0) {
      const syncEditors = async () => {
        console.log('Syncing editors to Supabase...');
        const payload = editors.map(e => ({
          id: e.id,
          name: e.name,
          group: e.group // Maps to "group" column
        }));
        
        const { error } = await supabaseClient.from('editors').upsert(payload);
        
        if (error) {
          console.error('Supabase editor sync error:', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
          });
        } else {
          console.log('Editors synced successfully');
        }
      };
      syncEditors();
    }
  }, [editors, isSupabaseConfigured, supabaseClient]);

  // --- Helpers ---
  const getProjectProgress = (project: Project) => {
    const completedCount = project.stages.filter(s => s.status === '已完成').length;
    return Math.round((completedCount / project.stages.length) * 100);
  };

  const getProjectStatus = (project: Project) => {
    const storageStage = project.stages.find(s => s.name === '入库');
    if (storageStage?.status === '已完成') return ProjectStatus.COMPLETED;
    
    const today = startOfDay(new Date());
    const storageDate = parseISO(storageStage?.plannedDate || '');
    if (isAfter(today, storageDate)) return ProjectStatus.OVERDUE;
    
    return ProjectStatus.ONGOING;
  };

  const getCurrentStage = (project: Project) => {
    const lastCompletedIndex = [...project.stages].reverse().findIndex(s => s.status === '已完成');
    if (lastCompletedIndex === -1) return project.stages[0].name;
    const index = project.stages.length - 1 - lastCompletedIndex;
    if (index === project.stages.length - 1) return '已入库';
    return project.stages[index + 1].name;
  };

  const isStageOverdue = (stage: Stage) => {
    if (stage.status === '已完成') return false;
    const today = startOfDay(new Date());
    return isAfter(today, parseISO(stage.plannedDate));
  };

  // --- Actions ---
  const handleAddProject = (data: Partial<Project>) => {
    const newProject: Project = {
      id: Math.random().toString(36).substr(2, 9),
      name: data.name || '未命名项目',
      group: data.group || '其他组',
      editorIds: data.editorIds || [],
      riskIssues: data.riskIssues || '',
      stages: data.stages || BOOK_STAGES.map((name, index) => ({
        name,
        plannedDate: index === BOOK_STAGES.length - 1 ? format(new Date(), 'yyyy-MM-dd') : '',
        status: '进行中'
      })),
      createdAt: new Date().toISOString()
    };
    setProjects([...projects, newProject]);
    setIsProjectModalOpen(false);
  };

  const handleUpdateProject = (id: string, updates: Partial<Project>) => {
    setProjects(projects.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const handleDeleteProject = (id: string) => {
    if (confirm('确定要删除这个项目吗？')) {
      setProjects(projects.filter(p => p.id !== id));
      if (selectedProjectId === id) setSelectedProjectId(null);
    }
  };

  const handleAddEditor = (name: string, group: Group) => {
    const newEditor: Editor = { id: Math.random().toString(36).substr(2, 9), name, group };
    setEditors([...editors, newEditor]);
  };

  const handleUpdateEditor = (id: string, name: string, group: Group) => {
    setEditors(editors.map(e => e.id === id ? { ...e, name, group } : e));
  };

  const handleDeleteEditor = (id: string) => {
    try {
      // Check if editor is assigned to any projects
      const assignedProjects = projects.filter(p => p.editorIds.includes(id));
      const message = assignedProjects.length > 0 
        ? `该编辑目前负责 ${assignedProjects.length} 个项目，删除后这些项目将变为“未分配”状态。确定要删除吗？`
        : '确定要删除这位编辑吗？';

      if (window.confirm(message)) {
        setEditors(prev => {
          const newEditors = prev.filter(e => e.id !== id);
          console.log('Deleting editor:', id, 'New editors count:', newEditors.length);
          return newEditors;
        });
        
        // Also update projects to remove this editorId
        setProjects(prev => prev.map(p => ({
          ...p,
          editorIds: p.editorIds.filter(eid => eid !== id)
        })));
      }
    } catch (error) {
      console.error('Error deleting editor:', error);
      alert('删除编辑时发生错误，请重试。');
    }
  };

  // --- Views ---
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 transform lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6">
          <div className="flex items-center gap-3 text-indigo-600 mb-8">
            <div className="bg-indigo-600 p-2 rounded-xl text-white">
              <BookOpen size={24} />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900">图书追踪系统</h1>
          </div>

          {/* Cloud Sync Status */}
          {isSupabaseConfigured && (
            <div className="mb-6 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {syncError ? (
                    <CloudOff size={14} className="text-rose-500" />
                  ) : isSyncing ? (
                    <RefreshCw size={14} className="text-indigo-500 animate-spin" />
                  ) : (
                    <Cloud size={14} className="text-emerald-500" />
                  )}
                  <span className="text-xs font-semibold text-slate-600">云端同步</span>
                </div>
                <button 
                  onClick={fetchFromCloud}
                  disabled={isSyncing}
                  className="p-1 hover:bg-slate-200 rounded-md transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                {syncError ? (
                  <span className="text-rose-400">{syncError}</span>
                ) : lastSync ? (
                  `上次同步: ${format(lastSync, 'HH:mm:ss')}`
                ) : (
                  '尚未同步'
                )}
              </p>
            </div>
          )}
          
          <nav className="space-y-1">
            <NavItem 
              icon={<LayoutDashboard size={20} />} 
              label="总览看板" 
              active={activeTab === 'dashboard'} 
              onClick={() => { setActiveTab('dashboard'); setSelectedProjectId(null); setIsSidebarOpen(false); }} 
            />
            <NavItem 
              icon={<BookOpen size={20} />} 
              label="项目列表" 
              active={activeTab === 'projects'} 
              onClick={() => { 
                setActiveTab('projects'); 
                setSelectedProjectId(null); 
                setProjectFilters({ status: 'all', editorId: 'all' });
                setIsSidebarOpen(false);
              }} 
            />
            <NavItem 
              icon={<Users size={20} />} 
              label="编辑管理" 
              active={activeTab === 'editors'} 
              onClick={() => { setActiveTab('editors'); setSelectedProjectId(null); setIsSidebarOpen(false); }} 
            />
          </nav>
        </div>
        
        <div className="mt-auto p-6 border-t border-slate-100">
          <button 
            onClick={() => { setEditingProject(null); setIsProjectModalOpen(true); setIsSidebarOpen(false); }}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-medium transition-all shadow-sm shadow-indigo-200"
          >
            <Plus size={18} />
            新增图书项目
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-slate-100 rounded-lg lg:hidden text-slate-600"
            >
              <LayoutDashboard size={24} />
            </button>
            <h2 className="text-lg font-semibold text-slate-800">
              {selectedProjectId ? '项目详情' : activeTab === 'dashboard' ? '数据看板' : activeTab === 'projects' ? '所有项目' : '编辑人员'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-500 font-medium hidden sm:block">
              {format(new Date(), 'yyyy年MM月dd日')}
            </div>
          </div>
        </header>

        {configError && (
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 m-4 lg:m-8 mb-0 rounded-r-md shadow-sm">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-800">配置警告</h3>
                <div className="mt-2 text-sm text-amber-700">
                  <p>{configError}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="p-4 lg:p-8">
          {selectedProjectId && selectedProject ? (
            <ProjectDetailView 
              project={selectedProject} 
              editors={editors}
              onBack={() => setSelectedProjectId(null)}
              onUpdate={(updates) => handleUpdateProject(selectedProject.id, updates)}
              onDelete={() => handleDeleteProject(selectedProject.id)}
              onEdit={() => { setEditingProject(selectedProject); setIsProjectModalOpen(true); }}
            />
          ) : activeTab === 'dashboard' ? (
            <DashboardView 
              projects={projects} 
              editors={editors} 
              onSelectProject={setSelectedProjectId}
              onNavigateToProjects={handleNavigateToProjects}
            />
          ) : activeTab === 'projects' ? (
            <ProjectListView 
              projects={projects} 
              editors={editors} 
              onSelectProject={setSelectedProjectId} 
              onDeleteProject={handleDeleteProject}
              onEditProject={(p) => { setEditingProject(p); setIsProjectModalOpen(true); }}
              initialFilters={projectFilters}
            />
          ) : (
            <EditorManagerView 
              editors={editors} 
              projects={projects}
              onAdd={handleAddEditor}
              onUpdate={handleUpdateEditor}
              onDelete={handleDeleteEditor}
            />
          )}
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {isProjectModalOpen && (
          <ProjectModal 
            isOpen={isProjectModalOpen}
            onClose={() => setIsProjectModalOpen(false)}
            onSave={editingProject ? (data) => handleUpdateProject(editingProject.id, data) : handleAddProject}
            editors={editors}
            onAddEditor={handleAddEditor}
            initialData={editingProject}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-components ---

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
        active 
          ? "bg-indigo-50 text-indigo-600" 
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function DashboardView({ projects, editors, onSelectProject, onNavigateToProjects }: { 
  projects: Project[], 
  editors: Editor[], 
  onSelectProject: (id: string) => void,
  onNavigateToProjects: (filters: { status?: string, editorId?: string }) => void
}) {
  const stats = useMemo(() => {
    const total = projects.length;
    const completed = projects.filter(p => {
      const storage = p.stages.find(s => s.name === '入库');
      return storage?.status === '已完成';
    }).length;
    const overdue = projects.filter(p => {
      const storage = p.stages.find(s => s.name === '入库');
      if (storage?.status === '已完成') return false;
      return isAfter(startOfDay(new Date()), parseISO(storage?.plannedDate || ''));
    }).length;
    const ongoing = total - completed;

    return { total, completed, ongoing, overdue };
  }, [projects]);

  return (
    <div className="space-y-8">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <StatCard 
          label="项目总数" 
          value={stats.total} 
          icon={<BookOpen className="text-indigo-600" />} 
          color="indigo" 
          onClick={() => onNavigateToProjects({ status: 'all' })}
        />
        <StatCard 
          label="已完成" 
          value={stats.completed} 
          icon={<CheckCircle2 className="text-emerald-600" />} 
          color="emerald" 
          onClick={() => onNavigateToProjects({ status: 'completed' })}
        />
        <StatCard 
          label="进行中" 
          value={stats.ongoing} 
          icon={<Clock className="text-amber-600" />} 
          color="amber" 
          onClick={() => onNavigateToProjects({ status: 'ongoing' })}
        />
        <StatCard 
          label="已逾期" 
          value={stats.overdue} 
          icon={<AlertCircle className="text-rose-600" />} 
          color="rose" 
          onClick={() => onNavigateToProjects({ status: 'overdue' })}
        />
      </div>

      {/* Project Overview (Collapsible) */}
      <ProjectRiskOverview projects={projects} onSelectProject={onSelectProject} />

      {/* Calendar Board */}
      <CalendarBoard projects={projects} onSelectProject={onSelectProject} />

      {/* Group Board */}
      <GroupBoard projects={projects} />
    </div>
  );
}

function ProjectRiskOverview({ projects, onSelectProject }: { projects: Project[], onSelectProject: (id: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(true); // Default to expanded for visibility
  
  const riskProjects = useMemo(() => {
    return projects.filter(p => p.riskIssues && p.riskIssues.trim() !== '');
  }, [projects]);

  if (riskProjects.length === 0) return null;

  return (
    <div className="glass-card overflow-hidden border-l-4 border-rose-500">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className="text-rose-600" />
          <h3 className="font-bold text-slate-800">风险概览</h3>
          <span className="text-xs font-medium text-slate-400 ml-2">
            共 {riskProjects.length} 个风险项目
          </span>
        </div>
        {isExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-100"
          >
            <div className="p-4 lg:p-6 pt-0 max-h-[400px] overflow-y-auto">
              <div className="overflow-x-auto -mx-4 lg:mx-0">
                <div className="inline-block min-w-full align-middle px-4 lg:px-0">
                  <table className="min-w-full text-left">
                    <thead className="sticky top-0 bg-white py-3 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="py-3 pr-4">项目名称</th>
                        <th className="py-3 pr-4">当前环节</th>
                        <th className="py-3">风险与问题</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {riskProjects.map(project => {
                        const currentStage = [...project.stages].find(s => s.status === '进行中')?.name || '已入库';
                        return (
                          <tr 
                            key={project.id} 
                            className={cn(
                              "group hover:bg-slate-50 transition-colors cursor-pointer",
                              "bg-rose-50/30"
                            )}
                            onClick={() => onSelectProject(project.id)}
                          >
                            <td className="py-4 pr-4">
                              <div className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate max-w-[120px] sm:max-w-[200px]">
                                {project.name}
                              </div>
                            </td>
                            <td className="py-4 pr-4">
                              <span className={cn(
                                "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
                                currentStage === '已入库' ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"
                              )}>
                                {currentStage}
                              </span>
                            </td>
                            <td className="py-4">
                              {project.riskIssues ? (
                                <div className="flex items-start gap-2 text-rose-600 text-sm min-w-[150px]">
                                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                                  <span className="line-clamp-2">{project.riskIssues}</span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">暂无风险</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GroupBoard({ projects }: { projects: Project[] }) {
  const groupData = useMemo(() => {
    return GROUPS.map(group => {
      const groupProjects = projects.filter(p => p.group === group);
      const completed = groupProjects.filter(p => p.stages.find(s => s.name === '入库')?.status === '已完成').length;
      const overdue = groupProjects.filter(p => {
        const storage = p.stages.find(s => s.name === '入库');
        if (storage?.status === '已完成') return false;
        return isAfter(startOfDay(new Date()), parseISO(storage?.plannedDate || ''));
      }).length;
      const pending = groupProjects.length - completed - overdue;
      
      return {
        name: group,
        total: groupProjects.length,
        completed,
        overdue,
        pending
      };
    });
  }, [projects]);

  return (
    <div className="glass-card p-6">
      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
        <BarChart3 size={20} className="text-indigo-600" />
        组别看板
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-8">
        {groupData.map(group => (
          <div key={group.name} className="space-y-3">
            <div className="flex justify-between items-end">
              <span className="text-sm font-bold text-slate-700">{group.name}</span>
              <span className="text-xs font-medium text-slate-400">总计: {group.total}</span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
              {group.total > 0 ? (
                <>
                  <div 
                    style={{ width: `${(group.completed / group.total) * 100}%` }} 
                    className="h-full bg-emerald-500 transition-all"
                    title={`已入库: ${group.completed}`}
                  />
                  <div 
                    style={{ width: `${(group.pending / group.total) * 100}%` }} 
                    className="h-full bg-blue-500 transition-all"
                    title={`待入库未逾期: ${group.pending}`}
                  />
                  <div 
                    style={{ width: `${(group.overdue / group.total) * 100}%` }} 
                    className="h-full bg-rose-500 transition-all"
                    title={`待入库已逾期: ${group.overdue}`}
                  />
                </>
              ) : (
                <div className="w-full h-full bg-slate-100" />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 pt-6 border-t border-slate-50 flex flex-wrap items-center gap-x-8 gap-y-4 text-xs font-medium text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-500"></div>
          <span>待入库未逾期</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-emerald-500"></div>
          <span>已入库</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-rose-500"></div>
          <span>待入库已逾期</span>
        </div>
      </div>
    </div>
  );
}

function CalendarBoard({ projects, onSelectProject }: { projects: Project[], onSelectProject: (id: string) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const projectsInMonth = useMemo(() => {
    return projects.filter(p => {
      const storage = p.stages.find(s => s.name === '入库');
      if (!storage?.plannedDate) return false;
      const date = parseISO(storage.plannedDate);
      return isSameMonth(date, currentMonth);
    });
  }, [projects, currentMonth]);

  const getDayProjects = (day: Date) => {
    return projects.filter(p => {
      const storage = p.stages.find(s => s.name === '入库');
      if (!storage?.plannedDate) return false;
      return isSameDay(parseISO(storage.plannedDate), day);
    });
  };

  const getProjectStatusColor = (project: Project) => {
    const storage = project.stages.find(s => s.name === '入库');
    if (storage?.status === '已完成') return 'bg-emerald-500';
    if (isAfter(startOfDay(new Date()), parseISO(storage?.plannedDate || ''))) return 'bg-rose-500';
    return 'bg-blue-500';
  };

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="glass-card p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Calendar size={20} className="text-indigo-600" />
          入库计划月历
        </h3>
        <div className="flex items-center justify-between sm:justify-end gap-4">
          <div className="text-base lg:text-lg font-bold text-slate-700">
            {format(currentMonth, 'yyyy年 M月', { locale: zhCN })}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500">
              <ChevronLeft size={20} />
            </button>
            <button onClick={() => setCurrentMonth(new Date())} className="px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              今天
            </button>
            <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 lg:mx-0 px-4 lg:px-0">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 gap-px bg-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {weekDays.map(day => (
              <div key={day} className="bg-slate-50 py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                {day}
              </div>
            ))}
            {calendarDays.map((day, i) => {
              const dayProjects = getDayProjects(day);
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isTodayDate = isToday(day);

              return (
                <div 
                  key={i} 
                  className={cn(
                    "min-h-[100px] bg-white p-2 transition-colors hover:bg-slate-50/50",
                    !isCurrentMonth && "bg-slate-50/30 text-slate-300"
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={cn(
                      "text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full",
                      isTodayDate ? "bg-indigo-600 text-white" : isCurrentMonth ? "text-slate-700" : "text-slate-300"
                    )}>
                      {format(day, 'd')}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {dayProjects.map(project => (
                      <button
                        key={project.id}
                        onClick={() => onSelectProject(project.id)}
                        className={cn(
                          "w-full text-left px-2 py-1 rounded text-[10px] font-medium text-white truncate transition-transform hover:scale-[1.02] active:scale-[0.98]",
                          getProjectStatusColor(project)
                        )}
                        title={project.name}
                      >
                        {project.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-500"></div>
          <span>计划入库</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-emerald-500"></div>
          <span>已入库</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-rose-500"></div>
          <span>已逾期</span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color, onClick }: { label: string, value: number, icon: React.ReactNode, color: string, onClick?: () => void }) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 border-indigo-100',
    emerald: 'bg-emerald-50 border-emerald-100',
    amber: 'bg-amber-50 border-amber-100',
    rose: 'bg-rose-50 border-rose-100',
  };

  return (
    <div 
      className={cn(
        "p-6 rounded-2xl border transition-all hover:shadow-md cursor-pointer", 
        colorMap[color]
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 bg-white rounded-xl shadow-sm">
          {icon}
        </div>
        <ChevronRight className="text-slate-400" size={20} />
      </div>
      <div>
        <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
        <div className="text-sm font-medium text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function ProjectListView({ projects, editors, onSelectProject, onDeleteProject, onEditProject, initialFilters }: { 
  projects: Project[], 
  editors: Editor[], 
  onSelectProject: (id: string) => void,
  onDeleteProject: (id: string) => void,
  onEditProject: (p: Project) => void,
  initialFilters?: { status?: string, editorId?: string }
}) {
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterEditor, setFilterEditor] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'progress'>('date');

  useEffect(() => {
    if (initialFilters) {
      if (initialFilters.status) setFilterStatus(initialFilters.status);
      if (initialFilters.editorId) setFilterEditor(initialFilters.editorId);
    }
  }, [initialFilters]);

  const filteredProjects = useMemo(() => {
    return projects
      .filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
        const matchesGroup = filterGroup === 'all' || p.group === filterGroup;
        const matchesEditor = filterEditor === 'all' || p.editorIds.includes(filterEditor);
        
        const storage = p.stages.find(s => s.name === '入库');
        const isCompleted = storage?.status === '已完成';
        const isOverdue = !isCompleted && isAfter(startOfDay(new Date()), parseISO(storage?.plannedDate || ''));
        const status = isCompleted ? 'completed' : isOverdue ? 'overdue' : 'ongoing';
        const matchesStatus = filterStatus === 'all' || status === filterStatus;

        return matchesSearch && matchesGroup && matchesStatus && matchesEditor;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'progress') {
          const progA = a.stages.filter(s => s.status === '已完成').length / a.stages.length;
          const progB = b.stages.filter(s => s.status === '已完成').length / b.stages.length;
          return progB - progA;
        }
        const dateA = a.stages.find(s => s.name === '入库')?.plannedDate || '';
        const dateB = b.stages.find(s => s.name === '入库')?.plannedDate || '';
        return dateA.localeCompare(dateB);
      });
  }, [projects, search, filterGroup, filterStatus, filterEditor, sortBy]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="搜索项目名称..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm sm:text-base"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <select 
            className="flex-1 sm:flex-none bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
          >
            <option value="all">所有组别</option>
            {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select 
            className="flex-1 sm:flex-none bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            value={filterEditor}
            onChange={(e) => setFilterEditor(e.target.value)}
          >
            <option value="all">所有编辑</option>
            {editors.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select 
            className="flex-1 sm:flex-none bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">所有状态</option>
            <option value="ongoing">进行中</option>
            <option value="completed">已完成</option>
            <option value="overdue">已逾期</option>
          </select>
          <select 
            className="w-full sm:w-auto bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="date">按入库时间排序</option>
            <option value="name">按名称排序</option>
            <option value="progress">按进度排序</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredProjects.map(project => (
          <ProjectCard 
            key={project.id} 
            project={project} 
            editors={editors}
            onClick={() => onSelectProject(project.id)}
            onDelete={() => onDeleteProject(project.id)}
            onEdit={() => onEditProject(project)}
          />
        ))}
        {filteredProjects.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
            <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="text-slate-400" size={24} />
            </div>
            <p className="text-slate-500 font-medium">没有找到匹配的项目</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, editors, onClick, onDelete, onEdit }: { 
  project: Project, 
  editors: Editor[], 
  onClick: () => void,
  onDelete: () => void,
  onEdit: () => void,
  key?: string
}) {
  const storageStage = project.stages.find(s => s.name === '入库');
  const isCompleted = storageStage?.status === '已完成';
  const isOverdue = !isCompleted && isAfter(startOfDay(new Date()), parseISO(storageStage?.plannedDate || ''));
  
  const progress = Math.round((project.stages.filter(s => s.status === '已完成').length / project.stages.length) * 100);
  const currentStageName = [...project.stages].find(s => s.status === '进行中')?.name || '已入库';
  
  const projectEditors = editors.filter(e => project.editorIds.includes(e.id));

  return (
    <div 
      className={cn(
        "glass-card p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 group cursor-pointer hover:border-indigo-300 transition-all relative",
        isOverdue && "border-rose-200 bg-rose-50/30",
        project.riskIssues && "border-rose-400 bg-rose-50 ring-1 ring-rose-200"
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 sm:mb-2">
          <h4 className="font-bold text-slate-900 truncate text-base sm:text-lg flex-1 sm:flex-none">{project.name}</h4>
          <div className="flex flex-wrap gap-2">
            <span className={cn(
              "status-pill",
              project.group === '绘本组' ? "bg-blue-100 text-blue-700" :
              project.group === '科普组' ? "bg-purple-100 text-purple-700" :
              project.group === '文学组' ? "bg-emerald-100 text-emerald-700" :
              "bg-slate-100 text-slate-700"
            )}>
              {project.group}
            </span>
            {isOverdue && (
              <span className="status-pill bg-rose-100 text-rose-700 flex items-center gap-1">
                <AlertTriangle size={12} />
                已逾期
              </span>
            )}
            {isCompleted && (
              <span className="status-pill bg-emerald-100 text-emerald-700 flex items-center gap-1">
                <CheckCircle2 size={12} />
                已完成
              </span>
            )}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-xs sm:text-sm text-slate-500">
          <div className="flex items-center gap-1.5">
            <Users size={14} className="sm:size-4" />
            <span className="truncate">{projectEditors.map(e => e.name).join(', ') || '未分配'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="sm:size-4" />
            <span>计划入库: {storageStage?.plannedDate}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="sm:size-4" />
            <span>当前环节: <span className="text-indigo-600 font-medium">{currentStageName}</span></span>
          </div>
        </div>
      </div>

      <div className="w-full sm:w-48 mt-2 sm:mt-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">完成进度</span>
          <span className="text-xs sm:text-sm font-bold text-indigo-600">{progress}%</span>
        </div>
        <div className="h-1.5 sm:h-2 bg-slate-100 rounded-full overflow-hidden">
          <div 
            className={cn("h-full rounded-full transition-all duration-500", isCompleted ? "bg-emerald-500" : "bg-indigo-600")}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity absolute top-4 right-4 sm:static">
        <button 
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 sm:p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          <Edit2 size={16} className="sm:size-[18px]" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
        >
          <Trash2 size={16} className="sm:size-[18px]" />
        </button>
        <ChevronRight className="text-slate-300 hidden sm:block" size={20} />
      </div>
    </div>
  );
}

function ProjectDetailView({ project, editors, onBack, onUpdate, onDelete, onEdit }: { 
  project: Project, 
  editors: Editor[], 
  onBack: () => void,
  onUpdate: (updates: Partial<Project>) => void,
  onDelete: () => void,
  onEdit: () => void
}) {
  const handleStageToggle = (index: number) => {
    const newStages = [...project.stages];
    newStages[index].status = newStages[index].status === '已完成' ? '进行中' : '已完成';
    onUpdate({ stages: newStages });
  };

  const handleDateChange = (index: number, date: string) => {
    const newStages = [...project.stages];
    newStages[index].plannedDate = date;
    onUpdate({ stages: newStages });
  };

  const progress = Math.round((project.stages.filter(s => s.status === '已完成').length / project.stages.length) * 100);
  const isProjectOverdue = project.stages.find(s => s.name === '入库')?.status !== '已完成' && 
    isAfter(startOfDay(new Date()), parseISO(project.stages.find(s => s.name === '入库')?.plannedDate || ''));

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20">
      <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors font-medium">
        <ArrowLeft size={20} />
        返回列表
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 truncate">{project.name}</h2>
            <div className="flex items-center gap-2">
              <span className="status-pill bg-indigo-100 text-indigo-700 text-xs sm:text-sm px-2 sm:px-3 py-1">{project.group}</span>
              <button 
                onClick={onEdit}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] sm:text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all shadow-sm"
              >
                <Edit2 size={10} className="sm:size-3" />
                项目信息
              </button>
            </div>
          </div>
          <p className="text-sm sm:text-base text-slate-500 flex items-center gap-2">
            <Users size={16} className="sm:size-[18px]" />
            责任编辑: {editors.filter(e => project.editorIds.includes(e.id)).map(e => e.name).join(', ') || '未分配'}
          </p>
        </div>
        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start bg-indigo-50 sm:bg-transparent p-4 sm:p-0 rounded-2xl sm:rounded-none">
          <div className="text-[10px] sm:text-sm font-bold text-slate-400 uppercase tracking-wider mb-0 sm:mb-1">总体进度</div>
          <div className="text-3xl sm:text-4xl font-black text-indigo-600">{progress}%</div>
        </div>
      </div>

      {/* Risk Issues */}
      <div className="glass-card p-6 border-l-4 border-l-amber-400">
        <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" />
          风险与问题
        </h3>
        <textarea 
          className="w-full bg-transparent border-none focus:ring-0 text-slate-600 resize-none min-h-[80px]"
          placeholder="暂无风险问题..."
          value={project.riskIssues}
          onChange={(e) => onUpdate({ riskIssues: e.target.value })}
        />
      </div>

      {/* Stages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {project.stages.map((stage, index) => {
          const isOverdue = stage.status === '进行中' && isAfter(startOfDay(new Date()), parseISO(stage.plannedDate));
          return (
            <div 
              key={stage.name} 
              className={cn(
                "p-4 rounded-xl border transition-all flex items-center justify-between",
                stage.status === '已完成' ? "bg-emerald-50 border-emerald-100" : 
                isOverdue ? "bg-rose-50 border-rose-200" : "bg-white border-slate-200"
              )}
            >
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => handleStageToggle(index)}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                    stage.status === '已完成' ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 hover:border-indigo-500"
                  )}
                >
                  {stage.status === '已完成' && <CheckCircle2 size={16} />}
                </button>
                <div>
                  <h4 className={cn("font-bold text-sm", stage.status === '已完成' ? "text-emerald-700" : "text-slate-700")}>
                    {index + 1}. {stage.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <input 
                      type="date" 
                      className="text-xs bg-transparent border-none p-0 focus:ring-0 text-slate-500 font-medium"
                      value={stage.plannedDate}
                      onChange={(e) => handleDateChange(index, e.target.value)}
                    />
                    {isOverdue && <span className="text-[10px] font-bold text-rose-600 uppercase">已逾期</span>}
                  </div>
                </div>
              </div>
              <div className="text-xs font-bold uppercase tracking-tighter">
                {stage.status === '已完成' ? (
                  <span className="text-emerald-600">DONE</span>
                ) : isOverdue ? (
                  <span className="text-rose-600">OVERDUE</span>
                ) : (
                  <span className="text-slate-400">PENDING</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 pt-8 border-t border-slate-200">
        <button 
          onClick={onDelete}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl border border-rose-200 text-rose-600 font-bold hover:bg-rose-50 transition-all text-sm sm:text-base"
        >
          删除项目
        </button>
      </div>
    </div>
  );
}

function EditorManagerView({ editors, projects, onAdd, onUpdate, onDelete }: { 
  editors: Editor[], 
  projects: Project[],
  onAdd: (name: string, group: Group) => void,
  onUpdate: (id: string, name: string, group: Group) => void,
  onDelete: (id: string) => void
}) {
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState<Group>('其他组');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editGroup, setEditGroup] = useState<Group>('其他组');

  const handleSave = (id: string) => {
    onUpdate(id, editValue, editGroup);
    setEditingId(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="glass-card p-4 sm:p-6">
        <h3 className="font-bold text-slate-800 mb-4 text-sm sm:text-base">新增编辑人员</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input 
            type="text" 
            placeholder="输入编辑姓名..." 
            className="flex-1 px-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="flex gap-2">
            <select 
              className="flex-1 sm:flex-none px-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value as Group)}
            >
              {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <button 
              onClick={() => { if (newName) { onAdd(newName, newGroup); setNewName(''); } }}
              className="flex-1 sm:flex-none bg-indigo-600 text-white px-6 py-2 sm:py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all text-sm"
            >
              添加
            </button>
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[500px]">
            <thead className="bg-slate-50 text-slate-500 text-[10px] sm:text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 sm:px-6 py-3 sm:py-4 font-semibold">编辑姓名</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 font-semibold">所属组别</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 font-semibold">负责项目数</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 font-semibold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {editors.map(editor => (
                <tr key={editor.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    {editingId === editor.id ? (
                      <input 
                        autoFocus
                        className="px-2 py-1 border border-indigo-300 rounded focus:outline-none w-full text-sm"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(editor.id); if (e.key === 'Escape') setEditingId(null); }}
                      />
                    ) : (
                      <span className="font-medium text-slate-900 text-sm">{editor.name}</span>
                    )}
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    {editingId === editor.id ? (
                      <select 
                        className="px-2 py-1 border border-indigo-300 rounded focus:outline-none text-xs sm:text-sm w-full"
                        value={editGroup}
                        onChange={(e) => setEditGroup(e.target.value as Group)}
                      >
                        {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    ) : (
                      <span className={cn(
                        "status-pill text-[10px] sm:text-xs",
                        editor.group === '绘本组' ? "bg-blue-100 text-blue-700" :
                        editor.group === '科普组' ? "bg-purple-100 text-purple-700" :
                        editor.group === '文学组' ? "bg-emerald-100 text-emerald-700" :
                        "bg-slate-100 text-slate-700"
                      )}>
                        {editor.group}
                      </span>
                    )}
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4 text-slate-500 text-xs sm:text-sm">
                    {projects.filter(p => p.editorIds.includes(editor.id)).length} 个项目
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">
                    <div className="flex items-center justify-end gap-1 sm:gap-2">
                      {editingId === editor.id ? (
                        <>
                          <button 
                            onClick={() => handleSave(editor.id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="保存"
                          >
                            <CheckCircle2 size={18} />
                          </button>
                          <button 
                            onClick={() => setEditingId(null)}
                            className="p-1 text-slate-400 hover:bg-slate-100 rounded transition-colors"
                            title="取消"
                          >
                            <X size={18} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => { setEditingId(editor.id); setEditValue(editor.name); setEditGroup(editor.group); }}
                            className="p-1.5 sm:p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                            title="编辑"
                          >
                            <Edit2 size={14} className="sm:size-4" />
                          </button>
                          <button 
                            onClick={() => {
                              console.log('Delete button clicked for editor:', editor.id);
                              onDelete(editor.id);
                            }}
                            className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="删除"
                          >
                            <Trash2 size={14} className="sm:size-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProjectModal({ isOpen, onClose, onSave, editors, onAddEditor, initialData }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: (data: Partial<Project>) => void,
  editors: Editor[],
  onAddEditor: (name: string, group: Group) => void,
  initialData?: Project | null
}) {
  const [formData, setFormData] = useState<Partial<Project>>(initialData || {
    name: '',
    group: '其他组',
    editorIds: [],
    riskIssues: '',
    stages: BOOK_STAGES.map((name, index) => ({
      name,
      plannedDate: index === BOOK_STAGES.length - 1 ? format(new Date(), 'yyyy-MM-dd') : '',
      status: '进行中'
    }))
  });

  const [newEditorName, setNewEditorName] = useState('');
  const [newEditorGroup, setNewEditorGroup] = useState<Group>('其他组');
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(0);

  const handleToggleEditor = (id: string) => {
    const current = formData.editorIds || [];
    if (current.includes(id)) {
      setFormData({ ...formData, editorIds: current.filter(eid => eid !== id) });
    } else {
      setFormData({ ...formData, editorIds: [...current, id] });
    }
  };

  const handleCurrentStageChange = (index: number) => {
    setCurrentStageIndex(index);
    if (!initialData) {
      const newStages = [...(formData.stages || [])];
      for (let i = 0; i < newStages.length; i++) {
        // i < index means stages BEFORE the selected one are completed
        // The selected stage (i === index) remains '进行中' (ongoing)
        newStages[i].status = i < index ? '已完成' : '进行中';
      }
      setFormData({ ...formData, stages: newStages });
    }
  };

  const handleStorageDateChange = (date: string) => {
    const newStages = [...(formData.stages || [])];
    const storageIndex = newStages.findIndex(s => s.name === '入库');
    if (storageIndex !== -1) {
      newStages[storageIndex].plannedDate = date;
    }
    setFormData({ ...formData, stages: newStages });
  };

  const currentStorageDate = formData.stages?.find(s => s.name === '入库')?.plannedDate || format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <h3 className="text-xl font-bold text-slate-900">{initialData ? '编辑项目' : '新增图书项目'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">项目名称</label>
            <input 
              type="text" 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="请输入图书名称"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">所属组别</label>
              <select 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={formData.group}
                onChange={(e) => setFormData({ ...formData, group: e.target.value as any })}
              >
                {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            {!initialData && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">当前环节 (自动完成之前环节)</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                  value={currentStageIndex}
                  onChange={(e) => handleCurrentStageChange(parseInt(e.target.value))}
                >
                  {BOOK_STAGES.map((s, i) => (
                    <option key={s} value={i}>{s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">计划入库时间</label>
            <input 
              type="date" 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              value={currentStorageDate}
              onChange={(e) => handleStorageDateChange(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">责任编辑 (可多选)</label>
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input 
                  type="text" 
                  placeholder="新增编辑姓名..." 
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={newEditorName}
                  onChange={(e) => setNewEditorName(e.target.value)}
                />
                <div className="flex gap-2">
                  <select 
                    className="flex-1 sm:flex-none px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={newEditorGroup}
                    onChange={(e) => setNewEditorGroup(e.target.value as Group)}
                  >
                    {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <button 
                    type="button"
                    onClick={() => {
                      if (newEditorName) {
                        onAddEditor(newEditorName, newEditorGroup);
                        setNewEditorName('');
                      }
                    }}
                    className="flex-1 sm:flex-none px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-200 transition-all"
                  >
                    添加
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl min-h-[50px]">
              {editors.map(editor => (
                <button
                  key={editor.id}
                  type="button"
                  onClick={() => handleToggleEditor(editor.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all",
                    formData.editorIds?.includes(editor.id) 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"
                  )}
                >
                  {editor.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">风险问题</label>
            <textarea 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 min-h-[100px]"
              placeholder="输入项目存在的风险或问题..."
              value={formData.riskIssues}
              onChange={(e) => setFormData({ ...formData, riskIssues: e.target.value })}
            />
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
          <button 
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-all text-sm sm:text-base"
          >
            取消
          </button>
          <button 
            onClick={() => onSave(formData)}
            className="w-full sm:w-auto px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 text-sm sm:text-base"
          >
            保存项目
          </button>
        </div>
      </motion.div>
    </div>
  );
}
