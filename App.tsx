import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut 
} from 'firebase/auth';
import { 
  getFirestore, doc, collection, addDoc, updateDoc, deleteDoc, getDocs, 
  onSnapshot, query, orderBy, limit, Timestamp, getDoc
} from 'firebase/firestore';
import { 
  Sun, LogIn, LogOut, PanelLeft, Plus, Users, FileText, Search, Clock, 
  CheckCircle, ChevronRight, X, Save, Trash2, Edit2, LayoutDashboard, ChevronLeft, Printer, Mail, Phone
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- CONFIGURATION ---
const firebaseConfig = {
  projectId: "gen-lang-client-0010037310",
  appId: "1:57767667025:web:a4c51cbf0af528a7909f70",
  apiKey: "AIzaSyAxNyuGP62WavvjEBj9k28Jp1h1BK2kYK0",
  authDomain: "gen-lang-client-0010037310.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-2e0c6cf4-a8f8-4861-91cc-b1127c3d5412",
  storageBucket: "gen-lang-client-0010037310.firebasestorage.app",
  messagingSenderId: "57767667025"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// --- UTILS ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

function formatDate(date: any) {
  if (!date) return '';
  const d = date instanceof Date ? date : date.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

// --- APP COMPONENT ---
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      alert('Erro ao fazer login com Google.');
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin text-yellow-500">
          <Sun size={48} />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-white p-10 rounded-[32px] shadow-2xl max-w-sm w-full text-center border border-slate-100">
          <div className="bg-yellow-100 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-8 animate-pulse">
            <Sun className="w-12 h-12 text-yellow-600" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tighter">SJ<span className="text-yellow-500"> SOLAR</span></h1>
          <p className="text-slate-500 mb-10 font-medium">Orçamentos & Gestão</p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white py-4 rounded-2xl hover:bg-slate-800 transition-all font-bold shadow-lg shadow-slate-200"
          >
            <LogIn size={20} /> Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Sidebar Desktop */}
      <aside className="no-print hidden md:flex flex-col w-72 bg-white border-r border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-12">
          <div className="bg-yellow-500 p-2 rounded-xl text-white">
            <Sun size={28} />
          </div>
          <span className="font-black text-xl tracking-tighter uppercase">SJ SOLAR</span>
        </div>

        <nav className="flex-1 space-y-2">
          <MenuButton 
            active={currentView === 'dashboard'} 
            onClick={() => setCurrentView('dashboard')}
            icon={<LayoutDashboard size={20} />}
            label="Dashboard"
          />
          <MenuButton 
            active={currentView === 'proposals'} 
            onClick={() => setCurrentView('proposals')}
            icon={<FileText size={20} />}
            label="Propostas"
          />
          <MenuButton 
            active={currentView === 'clients'} 
            onClick={() => setCurrentView('clients')}
            icon={<Users size={20} />}
            label="Clientes"
          />
        </nav>

        <div className="pt-6 border-t border-slate-100 mt-auto">
          <div className="flex items-center gap-3 mb-4">
            <img src={user.photoURL} alt="User" className="w-10 h-10 rounded-full border-2 border-yellow-500/20" />
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">{user.displayName}</p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-red-500 hover:bg-red-50 font-bold transition-colors"
          >
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto h-screen relative">
        <div className="p-4 md:p-10 max-w-6xl mx-auto w-full">
          {currentView === 'dashboard' && (
            <Dashboard 
              onNew={() => { setSelectedId(null); setCurrentView('form'); }}
              onView={(id) => { setSelectedId(id); setCurrentView('view'); }}
            />
          )}
          {currentView === 'proposals' && (
            <ProposalsList 
               onNew={() => { setSelectedId(null); setCurrentView('form'); }}
               onView={(id) => { setSelectedId(id); setCurrentView('view'); }}
               onEdit={(id) => { setSelectedId(id); setCurrentView('form'); }}
            />
          )}
          {currentView === 'clients' && <ClientsModule />}
          {currentView === 'form' && (
            <ProposalForm 
               id={selectedId} 
               onClose={() => setCurrentView('proposals')} 
            />
          )}
          {currentView === 'view' && (
            <ProposalDetail 
              id={selectedId} 
              onBack={() => setCurrentView('dashboard')} 
            />
          )}
        </div>

        {/* Mobile Nav */}
        <nav className="no-print md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 h-16 flex justify-around items-center px-4 z-50">
          <MobileButton 
            active={currentView === 'dashboard'} 
            onClick={() => setCurrentView('dashboard')}
            icon={<LayoutDashboard size={24} />}
          />
          <MobileButton 
            active={currentView === 'proposals'} 
            onClick={() => setCurrentView('proposals')}
            icon={<FileText size={24} />}
          />
          <MobileButton 
            active={currentView === 'form'} 
            onClick={() => { setSelectedId(null); setCurrentView('form'); }}
            icon={<Plus size={24} />}
            className="bg-yellow-500 text-white rounded-full -mt-10 shadow-xl border-4 border-white h-16 w-16"
          />
          <MobileButton 
            active={currentView === 'clients'} 
            onClick={() => setCurrentView('clients')}
            icon={<Users size={24} />}
          />
        </nav>
      </main>
    </div>
  );
}

function MenuButton({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all text-sm",
        active 
          ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
          : "text-slate-500 hover:bg-slate-100"
      )}
    >
      {icon} <span>{label}</span>
    </button>
  );
}

function MobileButton({ active, onClick, icon, className }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-2 transition-colors flex items-center justify-center",
        active ? "text-yellow-600" : "text-slate-400",
        className
      )}
    >
      {icon}
    </button>
  );
}

// --- DASHBOARD ---
function Dashboard({ onNew, onView }: any) {
  const [stats, setStats] = useState({ total: 0, active: 0, totalValue: 0 });
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'proposals'), orderBy('date', 'desc'), limit(5));
    const unsub = onSnapshot(q, (s) => {
      const list = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecent(list);
    });
    
    // Stats
    getDocs(collection(db, 'proposals')).then(s => {
      const docs = s.docs.map(d => d.data());
      setStats({
        total: docs.length,
        active: docs.filter(d => d.status === 'sent').length,
        totalValue: docs.filter(d => d.status === 'accepted').reduce((acc, d) => acc + (d.totalValue || 0), 0)
      });
    });

    return () => unsub();
  }, []);

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight mb-2">Painel de Controle</h1>
          <p className="text-slate-500 font-medium">Bem-vindo, acompanhe o crescimento da SJ Solar.</p>
        </div>
        <button 
          onClick={onNew}
          className="bg-yellow-500 hover:bg-yellow-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-yellow-200 transition-all active:scale-95 flex items-center gap-3"
        >
          <Plus size={18} /> Novo Orçamento
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard label="Total Propostas" value={stats.total} icon={<FileText className="text-blue-500" />} />
        <StatCard label="Aguardando" value={stats.active} icon={<Clock className="text-orange-500" />} />
        <StatCard label="Faturamento Confirmado" value={formatCurrency(stats.totalValue)} icon={<CheckCircle className="text-green-500" />} dark />
      </div>

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
          <h2 className="text-xl font-bold">Atividade Recente</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/50">
              <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-8 py-4">Cliente</th>
                <th className="px-8 py-4">Serviço</th>
                <th className="px-8 py-4 text-center">Status</th>
                <th className="px-8 py-4 text-right">Valor</th>
                <th className="px-8 py-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recent.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-5 font-bold text-slate-800">{p.clientName}</td>
                  <td className="px-8 py-5 text-sm text-slate-500">{p.serviceType}</td>
                  <td className="px-8 py-5 text-center"><Badge status={p.status} /></td>
                  <td className="px-8 py-5 text-right font-black text-slate-900">{formatCurrency(p.totalValue)}</td>
                  <td className="px-8 py-5 text-right">
                    <button onClick={() => onView(p.id)} className="p-2 hover:bg-yellow-100 rounded-lg text-yellow-600 transition-colors">
                      <ChevronRight size={20} />
                    </button>
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={5} className="p-12 text-center text-slate-400 font-medium italic">Nenhuma proposta recente encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, dark = false }: any) {
  return (
    <div className={cn(
      "p-8 rounded-[32px] border shadow-lg transition-transform hover:-translate-y-1",
      dark ? "bg-slate-900 text-white border-slate-800" : "bg-white text-slate-900 border-slate-100"
    )}>
      <div className="flex items-center justify-between mb-6">
        <div className={cn("p-4 rounded-2xl", dark ? "bg-slate-800" : "bg-slate-50")}>{icon}</div>
      </div>
      <p className={cn("text-xs font-black uppercase tracking-widest mb-1", dark ? "text-slate-400" : "text-slate-400")}>{label}</p>
      <p className="text-3xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function Badge({ status }: any) {
  const styles: any = {
    draft: 'bg-slate-100 text-slate-600',
    sent: 'bg-blue-50 text-blue-600',
    accepted: 'bg-green-50 text-green-600',
    rejected: 'bg-red-50 text-red-600'
  };
  return <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider", styles[status] || styles.draft)}>{status}</span>;
}

// --- CLIENTS ---
function ClientsModule() {
  const [clients, setClients] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  useEffect(() => {
    const q = query(collection(db, 'clients'), orderBy('name', 'asc'));
    return onSnapshot(q, s => setClients(s.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
  }, []);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    const f = e.target;
    const data = {
       name: f.name.value,
       email: f.email.value,
       phone: f.phone.value,
       address: f.address.value,
       updatedAt: Timestamp.now()
    };
    try {
      editItem 
        ? await updateDoc(doc(db, 'clients', editItem.id), data)
        : await addDoc(collection(db, 'clients'), { ...data, createdAt: Timestamp.now() });
      setShowModal(false);
    } catch (err) { alert('Erro ao salvar cliente.'); }
  };

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-black">Clientes</h1>
        <button onClick={() => { setEditItem(null); setShowModal(true); }} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2">
          <Plus size={20} /> Novo Cliente
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients.map(c => (
          <div key={c.id} className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-xl group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => { setEditItem(c); setShowModal(true); }} className="p-2 text-slate-400 hover:text-slate-900"><Edit2 size={18} /></button>
            </div>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-yellow-100 text-yellow-600 rounded-2xl flex items-center justify-center font-black text-xl">
                {c.name?.[0].toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-lg leading-tight truncate w-40">{c.name}</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Parceiro SJ Solar</p>
              </div>
            </div>
            <div className="space-y-3 pt-6 border-t border-slate-50">
              <div className="flex items-center gap-3 text-slate-500 text-sm">
                <Mail size={16} className="text-slate-300" /> {c.email || 'Email não cadastrado'}
              </div>
              <div className="flex items-center gap-3 text-slate-500 text-sm">
                <Phone size={16} className="text-slate-300" /> {c.phone || 'Tel não cadastrado'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-[40px] w-full max-w-lg shadow-2xl animate-in zoom-in duration-200">
            <h3 className="text-2xl font-black mb-8">{editItem ? 'Atualizar' : 'Novo'} Cliente</h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <input name="name" defaultValue={editItem?.name} placeholder="Nome Completo" required className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-yellow-500/20" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input name="email" defaultValue={editItem?.email} placeholder="E-mail" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none" />
                <input name="phone" defaultValue={editItem?.phone} placeholder="Telefone/WhatsApp" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none" />
              </div>
              <textarea name="address" defaultValue={editItem?.address} placeholder="Endereço Completo" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none" rows={3} />
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 border border-slate-100 rounded-2xl font-bold">Cancelar</button>
                <button type="submit" className="flex-1 py-4 bg-yellow-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest">Salvar Registro</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// --- PROPOSALS LIST ---
function ProposalsList({ onNew, onView, onEdit }: any) {
  const [proposals, setProposals] = useState<any[]>([]);
  useEffect(() => {
    const q = query(collection(db, 'proposals'), orderBy('date', 'desc'));
    return onSnapshot(q, s => setProposals(s.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
  }, []);

  const deleteItem = async (id: string) => {
    if(confirm('Deseja realmente excluir este orçamento?')) await deleteDoc(doc(db, 'proposals', id));
  };

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
         <h1 className="text-4xl font-black">Orçamentos</h1>
         <button onClick={onNew} className="bg-yellow-500 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-yellow-100">Nova Proposta</button>
      </div>
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full">
               <thead>
                  <tr className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400 text-left">
                    <th className="px-8 py-4">Nº / Cliente</th>
                    <th className="px-8 py-4">Serviço</th>
                    <th className="px-8 py-4">Data</th>
                    <th className="px-8 py-4">Status</th>
                    <th className="px-8 py-4 text-right">Valor Total</th>
                    <th className="px-8 py-4 text-right">Ações</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {proposals.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                       <td className="px-8 py-5">
                          <span className="text-xs font-black text-yellow-600 block mb-1">#{p.budgetNumber || 'S/N'}</span>
                          <span className="font-bold text-slate-800">{p.clientName}</span>
                       </td>
                       <td className="px-8 py-5 font-medium text-slate-500">{p.serviceType}</td>
                       <td className="px-8 py-5 text-sm">{formatDate(p.date)}</td>
                       <td className="px-8 py-5"><Badge status={p.status} /></td>
                       <td className="px-8 py-5 text-right font-black text-slate-900">{formatCurrency(p.totalValue)}</td>
                       <td className="px-8 py-5 text-right">
                          <div className="flex gap-2 justify-end">
                             <button onClick={() => onEdit(p.id)} className="p-2 text-slate-400 hover:text-slate-900 transition-colors"><Edit2 size={16} /></button>
                             <button onClick={() => deleteItem(p.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                             <button onClick={() => onView(p.id)} className="p-2 text-yellow-600 hover:bg-yellow-100 rounded-lg transition-colors"><ChevronRight size={18} /></button>
                          </div>
                       </td>
                    </tr>
                  ))}
                  {proposals.length === 0 && (
                     <tr><td colSpan={6} className="p-12 text-center text-slate-400 italic">Nenhum orçamento gerado ainda.</td></tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}

// --- PROPOSAL FORM ---
function ProposalForm({ id, onClose }: any) {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([{ id: 1, qty: 1, description: '' }]);
  const [formData, setFormData] = useState({
    clientId: '',
    clientName: '',
    serviceType: 'INSTALAÇÃO DE AQUECEDOR SOLAR',
    budgetNumber: '',
    date: new Date().toISOString().split('T')[0],
    equipmentValue: 0,
    installationValue: 0,
    showersPerDay: 4,
    equipmentWarrantyYears: 5,
    installationDescription: 'EQUIPAMENTOS INSTALADOS COM GARANTIA E QUALIDADE SJ SOLAR.',
    installationWarranty: '1 ANO DE GARANTIA NO SERVIÇO',
    status: 'draft'
  });

  useEffect(() => {
    getDocs(query(collection(db, 'clients'), orderBy('name', 'asc'))).then(s => setClients(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    if (id) {
       setLoading(true);
       getDoc(doc(db, 'proposals', id)).then(s => {
          if(s.exists()){
             const d = s.data();
             setFormData({ ...d, date: d.date.toDate().toISOString().split('T')[0] } as any);
             if(d.equipment) setItems(d.equipment.map((e: any, idx: number) => ({ id: idx, ...e })));
          }
          setLoading(false);
       });
    }
  }, [id]);

  const addItem = () => setItems([...items, { id: Date.now(), qty: 1, description: '' }]);
  const updateItem = (itemId: number | string, key: string, val: any) => setItems(items.map(it => it.id === itemId ? { ...it, [key]: val } : it));
  const removeItem = (itemId: number | string) => setItems(items.filter(it => it.id !== itemId));

  const total = (Number(formData.equipmentValue) || 0) + (Number(formData.installationValue) || 0);

  const onSave = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const submission = {
       ...formData,
       equipmentValue: Number(formData.equipmentValue),
       installationValue: Number(formData.installationValue),
       totalValue: total,
       equipment: items.map(({ id, ...rest }) => rest),
       date: Timestamp.fromDate(new Date(formData.date)),
       updatedAt: Timestamp.now()
    };
    try {
       id ? await updateDoc(doc(db, 'proposals', id), submission) : await addDoc(collection(db, 'proposals'), { ...submission, createdAt: Timestamp.now() } as any);
       onClose();
    } catch (err) { alert('Erro ao salvar proposta.'); } finally { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-[40px] border border-slate-100 shadow-2xl flex flex-col h-[calc(100vh-160px)] md:h-auto max-h-[90vh]">
       <div className="p-8 border-b border-slate-50 flex items-center justify-between">
          <div>
             <h2 className="text-2xl font-black">{id ? 'Editar' : 'Nova'} Proposta</h2>
             <p className="text-sm font-black text-yellow-600 uppercase tracking-widest mt-1">Total Estimado: {formatCurrency(total)}</p>
          </div>
          <button onClick={onClose} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-colors"><X size={24} /></button>
       </div>

       <form onSubmit={onSave} className="flex-1 overflow-y-auto p-8 space-y-12">
          {/* Geral */}
          <div className="space-y-6">
             <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-3">
                <div className="h-px bg-slate-100 flex-1"></div> Dados Básicos
             </h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <select 
                  value={formData.clientId} 
                  onChange={e => {
                    const cl = clients.find(c => c.id === e.target.value);
                    setFormData({ ...formData, clientId: e.target.value, clientName: cl?.name || '' });
                  }}
                  required
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold"
                >
                  <option value="">Selecione o Cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input 
                  value={formData.serviceType} 
                  onChange={e => setFormData({ ...formData, serviceType: e.target.value })}
                  placeholder="Tipo de Serviço (Ex: Aquecedor Solar)" 
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none"
                />
                <input 
                  type="date" 
                  value={formData.date} 
                  onChange={e => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold"
                />
                <input 
                  value={formData.budgetNumber} 
                  onChange={e => setFormData({ ...formData, budgetNumber: e.target.value })}
                  placeholder="Número do Orçamento" 
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none"
                />
             </div>
          </div>

          {/* Equipamentos */}
          <div className="space-y-6">
             <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Equipamentos</h3>
                <button type="button" onClick={addItem} className="text-xs font-black text-yellow-600 bg-yellow-50 px-4 py-2 rounded-lg">+ Adicionar Item</button>
             </div>
             <div className="space-y-4">
                {items.map(it => (
                   <div key={it.id} className="flex gap-4 items-center animate-in slide-in-from-left duration-200">
                      <input 
                        type="number" 
                        value={it.qty} 
                        onChange={e => updateItem(it.id, 'qty', Number(e.target.value))}
                        className="w-20 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-center font-bold"
                      />
                      <input 
                        value={it.description} 
                        onChange={e => updateItem(it.id, 'description', e.target.value)}
                        placeholder="Descrição do equipamento..." 
                        className="flex-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none"
                      />
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(it.id)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={18} /></button>
                      )}
                   </div>
                ))}
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                <div className="bg-slate-50 p-6 rounded-2xl">
                   <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Banhos Estimados</label>
                   <input type="number" value={formData.showersPerDay} onChange={e => setFormData({...formData, showersPerDay: Number(e.target.value)})} className="w-full bg-transparent font-bold text-lg outline-none" />
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl">
                   <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Anos de Garantia</label>
                   <input type="number" value={formData.equipmentWarrantyYears} onChange={e => setFormData({...formData, equipmentWarrantyYears: Number(e.target.value)})} className="w-full bg-transparent font-bold text-lg outline-none" />
                </div>
                <div className="bg-yellow-500 p-6 rounded-2xl text-white">
                   <label className="text-[10px] font-black uppercase block mb-2 text-yellow-100">Valor Produtos</label>
                   <input type="number" step="0.01" value={formData.equipmentValue} onChange={e => setFormData({...formData, equipmentValue: Number(e.target.value)})} className="w-full bg-transparent font-black text-2xl outline-none" />
                </div>
             </div>
          </div>

          {/* Instalação */}
          <div className="space-y-6">
             <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Instalação e Serviço</h3>
             <textarea 
               value={formData.installationDescription} 
               onChange={e => setFormData({...formData, installationDescription: e.target.value})}
               rows={3} 
               className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none" 
               placeholder="Descrição da mão de obra..."
             />
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="bg-slate-50 p-6 rounded-2xl">
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Termo Garantia</label>
                  <input value={formData.installationWarranty} onChange={e => setFormData({...formData, installationWarranty: e.target.value})} className="w-full bg-transparent font-bold outline-none" />
               </div>
               <div className="bg-slate-900 p-6 rounded-2xl text-white">
                  <label className="text-[10px] font-black uppercase block mb-2 text-slate-500">Valor Serviço</label>
                  <input type="number" step="0.01" value={formData.installationValue} onChange={e => setFormData({...formData, installationValue: Number(e.target.value)})} className="w-full bg-transparent font-black text-2xl outline-none text-yellow-400" />
               </div>
             </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-2xl">
             <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Status do Orçamento</label>
             <div className="flex gap-2">
                {['draft', 'sent', 'accepted', 'rejected'].map(s => (
                   <button 
                     key={s} 
                     type="button" 
                     onClick={() => setFormData({...formData, status: s})}
                     className={cn(
                       "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                       formData.status === s ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-400 border border-slate-100"
                     )}
                   >
                     {s}
                   </button>
                ))}
             </div>
          </div>
       </form>

       <div className="p-8 border-t border-slate-50 bg-slate-50/30 flex gap-4">
          <button onClick={onClose} className="flex-1 py-5 border border-slate-100 rounded-[24px] font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
          <button onClick={onSave} disabled={loading} className="flex-[2] py-5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-[24px] font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-yellow-100 disabled:opacity-50 transition-all flex items-center justify-center gap-3">
             <Save size={20} /> {loading ? 'Salvando...' : 'Finalizar Registro'}
          </button>
       </div>
    </div>
  );
}

// --- PROPOSAL DETAIL (PRINTABLE) ---
function ProposalDetail({ id, onBack }: any) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
     getDoc(doc(db, 'proposals', id)).then(s => setData({ id: s.id, ...s.data() }));
  }, [id]);

  if(!data) return <div className="p-20 text-center animate-pulse font-black text-yellow-600">CARREGANDO DOCUMENTO...</div>;

  return (
    <div className="space-y-8 pb-32">
       <div className="no-print flex items-center justify-between mb-10">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-400 font-bold hover:text-slate-900 transition-colors"><ChevronLeft /> Voltar</button>
          <button onClick={() => window.print()} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center gap-3">
             <Printer size={18} /> Gerar PDF / Imprimir
          </button>
       </div>

       <div className="bg-white p-12 md:p-20 rounded-[48px] shadow-2xl border border-slate-100 max-w-[850px] mx-auto print-area overflow-hidden">
          {/* Header Documento */}
          <div className="flex justify-between items-start border-b-[6px] border-yellow-500 pb-12 mb-12">
             <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-yellow-500 rounded-[24px] flex items-center justify-center font-black text-white text-4xl shadow-xl shadow-yellow-200">SJ</div>
                <div>
                   <h1 className="text-4xl font-black tracking-tight leading-none uppercase">SJ<span className="text-yellow-500"> SOLAR</span></h1>
                   <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-2">Tecnologia em Aquecimento</p>
                </div>
             </div>
             <div className="text-right">
                <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest mb-1">PROPOSTA COMERCIAL</p>
                <p className="text-2xl font-black text-slate-900">#{data.budgetNumber || '0000'}</p>
                <p className="text-xs font-bold text-yellow-600 mt-1">{formatDate(data.date)}</p>
             </div>
          </div>

          {/* Infos Cliente */}
          <div className="grid grid-cols-2 gap-12 mb-16">
             <div>
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest block mb-1 text-center bg-slate-50 py-1 rounded">CLIENTE</span>
                <p className="text-xl font-black text-slate-800">{data.clientName}</p>
             </div>
             <div className="text-right">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest block mb-1 text-center bg-slate-50 py-1 rounded">SERVIÇO</span>
                <p className="text-xl font-black text-yellow-600 uppercase italic">{data.serviceType}</p>
             </div>
          </div>

          {/* Tabela Itens */}
          <div className="mb-16">
             <table className="w-full">
                <thead>
                   <tr className="bg-slate-900 text-white">
                      <th className="px-6 py-4 text-left rounded-tl-2xl font-black uppercase text-[10px] tracking-widest w-24">Qtd</th>
                      <th className="px-6 py-4 text-left rounded-tr-2xl font-black uppercase text-[10px] tracking-widest">Descrição do Equipamento</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 border-x border-slate-50">
                   {data.equipment?.map((it: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                         <td className="px-6 py-6 font-black text-lg text-yellow-600">{it.qty.toString().padStart(2, '0')}</td>
                         <td className="px-6 py-6 font-bold text-slate-700 uppercase text-sm leading-relaxed">{it.description}</td>
                      </tr>
                   ))}
                </tbody>
             </table>
          </div>

          {/* Especificações Técnicas */}
          <div className="grid grid-cols-3 gap-6 mb-16">
             <div className="bg-slate-50 p-8 rounded-[32px] text-center border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">BANHOS / DIA</p>
                <p className="text-3xl font-black text-slate-900">{data.showersPerDay || '--'}</p>
             </div>
             <div className="bg-slate-50 p-8 rounded-[32px] text-center border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">GARANTIA FAB.</p>
                <p className="text-3xl font-black text-slate-900">{data.equipmentWarrantyYears || '5'} <span className="text-xs uppercase">ANOS</span></p>
             </div>
             <div className="bg-yellow-500/10 p-8 rounded-[32px] text-center border border-yellow-200">
                <p className="text-[10px] font-black text-yellow-600 uppercase tracking-widest mb-3">SUBTOTAL PROD.</p>
                <p className="text-2xl font-black text-yellow-700">{formatCurrency(data.equipmentValue)}</p>
             </div>
          </div>

          {/* Instalação */}
          <div className="space-y-4 mb-16">
             <div className="bg-slate-900 p-3 rounded-xl text-center text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Instalação e Serviços Técnicos</div>
             <div className="grid grid-cols-5 gap-6">
                <div className="col-span-3 bg-slate-50 p-8 rounded-[32px] border border-slate-100">
                   <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4">DESCRIÇÃO DA MÃO DE OBRA</p>
                   <p className="text-sm font-bold text-slate-600 leading-relaxed uppercase">{data.installationDescription}</p>
                   <div className="mt-6 inline-block bg-yellow-500 text-white px-4 py-2 rounded-lg text-[10px] font-black tracking-widest">{data.installationWarranty}</div>
                </div>
                <div className="col-span-2 bg-yellow-500 p-10 rounded-[32px] flex flex-col justify-center items-center text-white shadow-xl shadow-yellow-100">
                   <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-yellow-100">INVESTIMENTO SERVIÇO</p>
                   <p className="text-4xl font-black tracking-tighter">{formatCurrency(data.installationValue)}</p>
                </div>
             </div>
          </div>

          {/* TOTAL FINAL */}
          <div className="bg-slate-950 p-12 rounded-[40px] flex flex-col md:flex-row justify-between items-center text-white relative overflow-hidden shadow-2xl">
             <div className="absolute top-0 right-0 p-20 bg-yellow-500/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
             <div className="relative z-10 text-center md:text-left mb-6 md:mb-0">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">VALOR TOTAL DO INVESTIMENTO</p>
                <p className="text-xs text-slate-500 font-medium italic">Materiais + Mão de Obra incluídos (Condições sob consulta).</p>
             </div>
             <div className="relative z-10 text-5xl font-black text-yellow-400 tracking-tighter">
                {formatCurrency(data.totalValue)}
             </div>
          </div>

          {/* Rodapé */}
          <div className="mt-16 pt-12 border-t border-slate-100 text-center space-y-6">
             <p className="italic text-slate-400 font-medium text-xs">"Pois Deus não nos deu espírito de covardia, mas de poder, de amor e de equilíbrio." - 2 Timóteo 1:7</p>
             <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-[10px] font-black uppercase tracking-widest text-slate-300">
                <span>SJ SOLAR</span>
                <span>|</span>
                <span>BELO HORIZONTE / MG</span>
                <span>|</span>
                <span>(31) 99302-7837</span>
             </div>
          </div>
       </div>
    </div>
  );
}
