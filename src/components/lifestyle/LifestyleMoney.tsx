import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Pencil,
  Trash2,
  Archive,
  Filter,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Calendar,
  Tag,
  FileText,
  X,
  Check,
  ChevronDown,
  Sparkles,
  PieChart as PieIcon,
  Layers,
} from 'lucide-react';
import {
  MoneyCategory,
  MoneyTransaction,
  MoneyBudget,
  formatCurrency,
  getBudgetInForce,
  normalizeToMonthStart,
} from '../../lib/moneyScoring';
import { formatDisplayDate, compareDates } from '../../lib/dateUtils';
import { useLifestyle } from '../../lib/useLifestyle';

interface LifestyleMoneyProps {
  userId: string;
}

const COMMON_CURRENCIES = [
  { code: 'USD', name: 'US Dollar ($)' },
  { code: 'EUR', name: 'Euro (€)' },
  { code: 'GBP', name: 'British Pound (£)' },
  { code: 'BDT', name: 'Bangladeshi Taka (৳)' },
  { code: 'PHP', name: 'Philippine Peso (₱)' },
  { code: 'INR', name: 'Indian Rupee (₹)' },
  { code: 'CAD', name: 'Canadian Dollar ($)' },
  { code: 'AUD', name: 'Australian Dollar ($)' },
  { code: 'JPY', name: 'Japanese Yen (¥)' },
  { code: 'SGD', name: 'Singapore Dollar ($)' },
  { code: 'MYR', name: 'Malaysian Ringgit (RM)' },
  { code: 'AED', name: 'UAE Dirham (د.إ)' },
];

const PRESET_COLORS = [
  '#f97316', // Orange
  '#06b6d4', // Cyan
  '#eab308', // Amber
  '#a855f7', // Purple
  '#10b981', // Emerald
  '#ec4899', // Pink
  '#64748b', // Slate
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#14b8a6', // Teal
];

const PRESET_EMOJIS = ['🍔', '🚗', '💡', '🛍️', '💊', '🎬', '📦', '💼', '💵', '🏠', '📚', '☕', '✈️', '🎮'];

export const LifestyleMoney: React.FC<LifestyleMoneyProps> = ({ userId }) => {
  const { state, store } = useLifestyle(userId);
  const { today, currency, categories, transactions, budgets } = state;

  // Active inner view: 'transactions' | 'categories'
  const [activeSection, setActiveSection] = useState<'transactions' | 'categories'>('transactions');

  // Filters for transactions
  const currentMonthStr = today.slice(0, 7); // YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedType, setSelectedType] = useState<'all' | 'expense' | 'income'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Currency Picker Modal (shows automatically if currency is unset)
  const [currencyModalOpen, setCurrencyModalOpen] = useState(!currency);
  const [customCurrency, setCustomCurrency] = useState('');
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState(currency || 'USD');

  // Transaction Modal State
  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<MoneyTransaction | null>(null);
  const [txnAmount, setTxnAmount] = useState('');
  const [txnType, setTxnType] = useState<'expense' | 'income'>('expense');
  const [txnCategoryId, setTxnCategoryId] = useState('');
  const [txnDate, setTxnDate] = useState(today);
  const [txnNote, setTxnNote] = useState('');
  const [txnError, setTxnError] = useState('');

  // Category Modal State
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<MoneyCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catKind, setCatKind] = useState<'expense' | 'income'>('expense');
  const [catColor, setCatColor] = useState(PRESET_COLORS[0]);
  const [catIcon, setCatIcon] = useState(PRESET_EMOJIS[0]);
  const [catError, setCatError] = useState('');

  // Budget Modal State (for overall or per-category)
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetTargetCat, setBudgetTargetCat] = useState<MoneyCategory | null>(null); // null = overall
  const [budgetAmount, setBudgetAmount] = useState('');

  // Available months from transactions + current month
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(currentMonthStr);
    for (const t of transactions) {
      set.add(t.txn_date.slice(0, 7));
    }
    const arr = Array.from(set);
    arr.sort((a, b) => b.localeCompare(a));
    return arr;
  }, [transactions, currentMonthStr]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (selectedMonth !== 'all' && !t.txn_date.startsWith(selectedMonth)) return false;
      if (selectedType !== 'all' && t.type !== selectedType) return false;
      if (selectedCategory !== 'all' && t.category_id !== selectedCategory) return false;
      return true;
    });
  }, [transactions, selectedMonth, selectedType, selectedCategory]);

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    const groups: { date: string; displayDate: string; txns: MoneyTransaction[]; dayExpense: number; dayIncome: number }[] = [];
    const dateMap = new Map<string, MoneyTransaction[]>();

    for (const t of filteredTransactions) {
      if (!dateMap.has(t.txn_date)) {
        dateMap.set(t.txn_date, []);
      }
      dateMap.get(t.txn_date)!.push(t);
    }

    const sortedDates = Array.from(dateMap.keys()).sort((a, b) => b.localeCompare(a));

    for (const d of sortedDates) {
      const txns = dateMap.get(d)!;
      let dayExpense = 0;
      let dayIncome = 0;
      for (const t of txns) {
        if (t.type === 'expense') dayExpense += Number(t.amount);
        else dayIncome += Number(t.amount);
      }

      let display = formatDisplayDate(d);
      if (d === today) display = `Today (${display})`;

      groups.push({
        date: d,
        displayDate: display,
        txns,
        dayExpense,
        dayIncome,
      });
    }

    return groups;
  }, [filteredTransactions, today]);

  // Summary figures for selected period
  const periodSummary = useMemo(() => {
    let spent = 0;
    let income = 0;
    for (const t of filteredTransactions) {
      if (t.type === 'expense') spent += Number(t.amount);
      else income += Number(t.amount);
    }
    return { spent, income, net: income - spent };
  }, [filteredTransactions]);

  // Overall budget in force for current month
  const overallBudgetInForce = useMemo(() => {
    return getBudgetInForce(budgets, today, null);
  }, [budgets, today]);

  // Map of categories by id
  const categoryMap = useMemo(() => {
    const m = new Map<string, MoneyCategory>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  // ──────────────────────── ACTION HANDLERS ────────────────────────

  const handleSaveCurrency = async () => {
    const finalCode = (customCurrency.trim() || selectedCurrencyCode).toUpperCase();
    if (!finalCode) return;
    try {
      await store.updateLifestylePreferences({ currency: finalCode });
      setCurrencyModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save currency');
    }
  };

  const handleOpenAddTxn = (defaultDate?: string) => {
    setEditingTxn(null);
    setTxnAmount('');
    setTxnType('expense');
    setTxnDate(defaultDate || today);
    setTxnNote('');
    setTxnError('');

    // Select first matching category
    const activeCats = categories.filter((c) => !c.archived && c.kind === 'expense');
    setTxnCategoryId(activeCats.length > 0 ? activeCats[0].id : '');
    setTxnModalOpen(true);
  };

  const handleOpenEditTxn = (txn: MoneyTransaction) => {
    setEditingTxn(txn);
    setTxnAmount(String(txn.amount));
    setTxnType(txn.type);
    setTxnCategoryId(txn.category_id);
    setTxnDate(txn.txn_date);
    setTxnNote(txn.note || '');
    setTxnError('');
    setTxnModalOpen(true);
  };

  const handleSaveTxn = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxnError('');

    const parsedAmount = parseFloat(txnAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setTxnError('Please enter a valid amount greater than 0');
      return;
    }
    if (!txnCategoryId) {
      setTxnError('Please choose a category');
      return;
    }

    try {
      if (editingTxn) {
        await store.updateTransaction(editingTxn.id, {
          type: txnType,
          amount: parsedAmount,
          category_id: txnCategoryId,
          txn_date: txnDate,
          note: txnNote,
        });
      } else {
        await store.createTransaction({
          type: txnType,
          amount: parsedAmount,
          category_id: txnCategoryId,
          txn_date: txnDate,
          note: txnNote,
        });
      }
      setTxnModalOpen(false);
    } catch (err: any) {
      setTxnError(err.message || 'Failed to save transaction');
    }
  };

  const handleDeleteTxn = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    try {
      await store.deleteTransaction(id);
      setTxnModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  };

  const handleOpenAddCat = (kind: 'expense' | 'income' = 'expense') => {
    setEditingCat(null);
    setCatName('');
    setCatKind(kind);
    setCatColor(PRESET_COLORS[0]);
    setCatIcon(PRESET_EMOJIS[0]);
    setCatError('');
    setCatModalOpen(true);
  };

  const handleOpenEditCat = (cat: MoneyCategory) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatKind(cat.kind);
    setCatColor(cat.color || PRESET_COLORS[0]);
    setCatIcon(cat.icon || PRESET_EMOJIS[0]);
    setCatError('');
    setCatModalOpen(true);
  };

  const handleSaveCat = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError('');
    if (!catName.trim()) {
      setCatError('Category name is required');
      return;
    }

    try {
      if (editingCat) {
        await store.updateCategory(editingCat.id, {
          name: catName.trim(),
          color: catColor,
          icon: catIcon,
        });
      } else {
        await store.createCategory({
          name: catName.trim(),
          kind: catKind,
          color: catColor,
          icon: catIcon,
        });
      }
      setCatModalOpen(false);
    } catch (err: any) {
      setCatError(err.message || 'Failed to save category');
    }
  };

  const handleArchiveCat = async (cat: MoneyCategory) => {
    if (!confirm(`Archive category "${cat.name}"? Existing transactions will retain it.`)) return;
    try {
      await store.archiveCategory(cat.id);
    } catch (err: any) {
      alert(err.message || 'Failed to archive category');
    }
  };

  const handleOpenBudgetModal = (cat: MoneyCategory | null) => {
    setBudgetTargetCat(cat);
    const existing = getBudgetInForce(budgets, today, cat ? cat.id : null);
    setBudgetAmount(existing ? String(existing.amount) : '');
    setBudgetModalOpen(true);
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(budgetAmount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      alert('Please enter a valid amount (>= 0)');
      return;
    }

    try {
      await store.setBudget({
        effective_month: today,
        category_id: budgetTargetCat ? budgetTargetCat.id : null,
        amount: parsedAmount,
      });
      setBudgetModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save budget');
    }
  };

  const handleAddStarters = async () => {
    try {
      await store.addStarterCategories();
    } catch (err: any) {
      alert(err.message || 'Failed to add starter categories');
    }
  };

  // Filter categories for the current txn type in modal
  const eligibleCategoriesForTxn = useMemo(() => {
    return categories.filter((c) => {
      if (c.kind !== txnType) return false;
      if (c.archived && (!editingTxn || editingTxn.category_id !== c.id)) return false;
      return true;
    });
  }, [categories, txnType, editingTxn]);

  return (
    <div className="space-y-6">
      {/* ── Top Header & Sub-Navigation ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveSection('transactions')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSection === 'transactions'
                  ? 'bg-white text-emerald-950 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <DollarSign size={14} className="text-emerald-600" />
              Transactions
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('categories')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSection === 'categories'
                  ? 'bg-white text-emerald-950 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Layers size={14} className="text-emerald-600" />
              Categories & Budget
            </button>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2">
          {activeSection === 'transactions' && (
            <button
              type="button"
              onClick={() => handleOpenAddTxn()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
            >
              <Plus size={15} />
              Add Transaction
            </button>
          )}

          {activeSection === 'categories' && (
            <button
              type="button"
              onClick={() => handleOpenAddCat('expense')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
            >
              <Plus size={15} />
              Add Category
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Ribbon ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Expenses</span>
            <span className="text-xl font-bold font-['Fredoka'] text-rose-600">
              {formatCurrency(periodSummary.spent, currency)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500">
            <TrendingDown size={20} />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Income</span>
            <span className="text-xl font-bold font-['Fredoka'] text-emerald-600">
              {formatCurrency(periodSummary.income, currency)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
            <TrendingUp size={20} />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Net Balance</span>
            <span
              className={`text-xl font-bold font-['Fredoka'] ${
                periodSummary.net >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {periodSummary.net >= 0 ? '+' : ''}
              {formatCurrency(periodSummary.net, currency)}
            </span>
          </div>
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              periodSummary.net >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}
          >
            <DollarSign size={20} />
          </div>
        </div>
      </div>

      {/* ──────────────────────── TRANSACTIONS SECTION ──────────────────────── */}
      {activeSection === 'transactions' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="p-3 rounded-2xl bg-white/60 backdrop-blur-md border border-white/60 shadow-sm flex flex-wrap items-center gap-2.5 text-xs">
            <div className="flex items-center gap-1.5 text-gray-500 font-semibold pl-1">
              <Filter size={13} />
              <span>Filter:</span>
            </div>

            {/* Month Filter */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white/80 font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <option value="all">All Months</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {/* Type Filter */}
            <div className="flex bg-gray-100 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => setSelectedType('all')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  selectedType === 'all' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedType('expense')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  selectedType === 'expense' ? 'bg-white text-rose-600 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Expenses
              </button>
              <button
                type="button"
                onClick={() => setSelectedType('income')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  selectedType === 'income' ? 'bg-white text-emerald-600 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Income
              </button>
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white/80 font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 max-w-[160px]"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon || ''} {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Transactions Grouped List */}
          {groupedTransactions.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white/60 backdrop-blur-md border border-white/60 shadow-sm space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <DollarSign size={24} />
              </div>
              <p className="text-sm font-bold text-gray-700 font-['Fredoka']">No transactions found</p>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Track your expenses and income to see budget insights and calendar heatmaps.
              </p>
              <button
                type="button"
                onClick={() => handleOpenAddTxn()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
              >
                <Plus size={14} />
                Add Your First Transaction
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedTransactions.map((group) => (
                <div key={group.date} className="space-y-1.5">
                  {/* Day Header */}
                  <div className="flex items-center justify-between px-2 text-xs text-gray-500 font-semibold">
                    <span>{group.displayDate}</span>
                    <span className="font-mono">
                      {group.dayExpense > 0 && (
                        <span className="text-rose-600 font-bold mr-2">
                          -{formatCurrency(group.dayExpense, currency)}
                        </span>
                      )}
                      {group.dayIncome > 0 && (
                        <span className="text-emerald-600 font-bold">
                          +{formatCurrency(group.dayIncome, currency)}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Day Transactions Cards */}
                  <div className="rounded-2xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm overflow-hidden divide-y divide-gray-100">
                    {group.txns.map((txn) => {
                      const cat = categoryMap.get(txn.category_id);
                      const isExpense = txn.type === 'expense';

                      return (
                        <div
                          key={txn.id}
                          className="flex items-center justify-between p-3 hover:bg-white/90 transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-base shadow-xs"
                              style={{ backgroundColor: `${cat?.color || '#94a3b8'}20` }}
                            >
                              {cat?.icon || '📦'}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-gray-900">
                                  {cat?.name || 'Uncategorized'}
                                </span>
                                {cat?.archived && (
                                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1 rounded">archived</span>
                                )}
                              </div>
                              {txn.note && (
                                <p className="text-[11px] text-gray-500 line-clamp-1">{txn.note}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span
                              className={`text-sm font-bold font-mono ${
                                isExpense ? 'text-gray-900' : 'text-emerald-600'
                              }`}
                            >
                              {isExpense ? '-' : '+'}
                              {formatCurrency(Number(txn.amount), currency)}
                            </span>

                            <div className="flex items-center gap-1 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => handleOpenEditTxn(txn)}
                                className="p-1.5 text-gray-400 hover:text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"
                                title="Edit"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTxn(txn.id)}
                                className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────── CATEGORIES & BUDGET SECTION ──────────────────────── */}
      {activeSection === 'categories' && (
        <div className="space-y-6">
          {/* Starter Categories Empty State */}
          {categories.length === 0 && (
            <div className="p-8 rounded-2xl bg-linear-to-br from-emerald-50/80 to-teal-50/80 border border-emerald-200/60 shadow-sm text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-emerald-600 mx-auto">
                <Sparkles size={24} />
              </div>
              <h4 className="text-base font-bold font-['Fredoka'] text-emerald-950">
                Setup your starter categories
              </h4>
              <p className="text-xs text-emerald-800/80 max-w-md mx-auto">
                Add standard starter categories for food, transport, bills, shopping, health, fun, salary, and more with one tap.
              </p>
              <button
                type="button"
                onClick={handleAddStarters}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all cursor-pointer"
              >
                <Sparkles size={14} />
                Add Starter Categories
              </button>
            </div>
          )}

          {/* Overall Monthly Budget Card */}
          <div className="p-5 rounded-2xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-gray-900 font-['Fredoka'] flex items-center gap-1.5">
                  <PieIcon size={16} className="text-emerald-600" />
                  Overall Monthly Budget
                </h4>
                <p className="text-xs text-gray-500">
                  Target spending limit for your total monthly expenses.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleOpenBudgetModal(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 transition-all cursor-pointer"
              >
                {overallBudgetInForce ? 'Update Budget' : 'Set Budget'}
              </button>
            </div>

            <div className="p-3 rounded-xl bg-gray-50/80 border border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-600">Current Monthly Cap:</span>
              <span className="text-base font-bold font-mono text-gray-900">
                {overallBudgetInForce
                  ? formatCurrency(overallBudgetInForce.amount, currency)
                  : 'Not set'}
              </span>
            </div>
          </div>

          {/* Categories Grid (Expense & Income) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase text-gray-500 tracking-wider">
                Expense Categories ({categories.filter((c) => c.kind === 'expense').length})
              </h4>
              <button
                type="button"
                onClick={() => handleOpenAddCat('expense')}
                className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1"
              >
                <Plus size={12} /> New Expense Category
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {categories
                .filter((c) => c.kind === 'expense')
                .map((cat) => {
                  const catBudget = getBudgetInForce(budgets, today, cat.id);

                  return (
                    <div
                      key={cat.id}
                      className={`p-3.5 rounded-2xl bg-white/70 backdrop-blur-md border transition-all ${
                        cat.archived ? 'opacity-60 border-gray-200' : 'border-white/60 shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-xs"
                            style={{ backgroundColor: `${cat.color || '#94a3b8'}20` }}
                          >
                            {cat.icon || '📦'}
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold text-gray-900">{cat.name}</span>
                              {cat.archived && (
                                <span className="text-[9px] text-gray-400 bg-gray-100 px-1 rounded">
                                  archived
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-gray-500 block font-mono">
                              {catBudget ? `${formatCurrency(catBudget.amount, currency)}/mo` : 'No budget'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenBudgetModal(cat)}
                            className="p-1 text-gray-400 hover:text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"
                            title="Set Category Budget"
                          >
                            <DollarSign size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditCat(cat)}
                            className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          {!cat.archived && (
                            <button
                              type="button"
                              onClick={() => handleArchiveCat(cat)}
                              className="p-1 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                              title="Archive"
                            >
                              <Archive size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Income Categories */}
          <div className="space-y-4 pt-4 border-t border-gray-200/50">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase text-gray-500 tracking-wider">
                Income Categories ({categories.filter((c) => c.kind === 'income').length})
              </h4>
              <button
                type="button"
                onClick={() => handleOpenAddCat('income')}
                className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1"
              >
                <Plus size={12} /> New Income Category
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {categories
                .filter((c) => c.kind === 'income')
                .map((cat) => (
                  <div
                    key={cat.id}
                    className={`p-3.5 rounded-2xl bg-white/70 backdrop-blur-md border transition-all ${
                      cat.archived ? 'opacity-60 border-gray-200' : 'border-white/60 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-xs"
                          style={{ backgroundColor: `${cat.color || '#94a3b8'}20` }}
                        >
                          {cat.icon || '💵'}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-gray-900">{cat.name}</span>
                          {cat.archived && (
                            <span className="text-[9px] text-gray-400 bg-gray-100 px-1 rounded ml-1">
                              archived
                            </span>
                          )}
                          <span className="text-[10px] text-emerald-600 font-semibold block">Income source</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditCat(cat)}
                          className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        {!cat.archived && (
                          <button
                            type="button"
                            onClick={() => handleArchiveCat(cat)}
                            className="p-1 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            title="Archive"
                          >
                            <Archive size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────── MODAL: ADD / EDIT TRANSACTION ──────────────────────── */}
      <AnimatePresence>
        {txnModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100"
            >
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-base text-gray-900 font-['Fredoka']">
                  {editingTxn ? 'Edit Transaction' : 'New Transaction'}
                </h3>
                <button
                  type="button"
                  onClick={() => setTxnModalOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveTxn} className="p-5 space-y-4">
                {txnError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                    {txnError}
                  </div>
                )}

                {/* Type Switch */}
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setTxnType('expense');
                      const cats = categories.filter((c) => !c.archived && c.kind === 'expense');
                      setTxnCategoryId(cats.length > 0 ? cats[0].id : '');
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      txnType === 'expense'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxnType('income');
                      const cats = categories.filter((c) => !c.archived && c.kind === 'income');
                      setTxnCategoryId(cats.length > 0 ? cats[0].id : '');
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      txnType === 'income'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Income
                  </button>
                </div>

                {/* Amount */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Amount ({currency || 'USD'})
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={txnAmount}
                      onChange={(e) => setTxnAmount(e.target.value)}
                      className="w-full text-2xl font-bold font-mono p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Category Picker */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Category</label>
                  {eligibleCategoriesForTxn.length === 0 ? (
                    <div className="text-xs text-rose-600 p-2 bg-rose-50 rounded-xl">
                      No active {txnType} categories available. Please create one in Categories & Budget first.
                    </div>
                  ) : (
                    <select
                      value={txnCategoryId}
                      onChange={(e) => setTxnCategoryId(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {eligibleCategoriesForTxn.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.icon || '📦'} {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Date */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Date</label>
                  <input
                    type="date"
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Note */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Note <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Weekly grocery run"
                    value={txnNote}
                    onChange={(e) => setTxnNote(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Buttons */}
                <div className="flex items-center justify-between pt-2">
                  {editingTxn ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteTxn(editingTxn.id)}
                      className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    >
                      Delete
                    </button>
                  ) : <div />}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTxnModalOpen(false)}
                      className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={eligibleCategoriesForTxn.length === 0}
                      className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      Save Transaction
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ──────────────────────── MODAL: ADD / EDIT CATEGORY ──────────────────────── */}
      <AnimatePresence>
        {catModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100"
            >
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-base text-gray-900 font-['Fredoka']">
                  {editingCat ? 'Edit Category' : 'New Category'}
                </h3>
                <button
                  type="button"
                  onClick={() => setCatModalOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveCat} className="p-5 space-y-4">
                {catError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                    {catError}
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Category Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Coffee & Snacks"
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                    autoFocus
                  />
                </div>

                {/* Kind */}
                {!editingCat && (
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">Type</label>
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setCatKind('expense')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          catKind === 'expense'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Expense
                      </button>
                      <button
                        type="button"
                        onClick={() => setCatKind('income')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          catKind === 'income'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Income
                      </button>
                    </div>
                  </div>
                )}

                {/* Icon Selection */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">Icon</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {PRESET_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setCatIcon(emoji)}
                        className={`w-9 h-9 rounded-xl text-base flex items-center justify-center transition-all ${
                          catIcon === emoji ? 'bg-emerald-100 ring-2 ring-emerald-500 scale-105' : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="Or type custom emoji"
                    value={catIcon}
                    onChange={(e) => setCatIcon(e.target.value)}
                    className="w-24 p-2 text-center text-base rounded-xl border border-gray-200"
                  />
                </div>

                {/* Color Selection */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCatColor(c)}
                        className={`w-7 h-7 rounded-full transition-all ${
                          catColor === c ? 'ring-2 ring-offset-2 ring-gray-600 scale-110' : ''
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCatModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    Save Category
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ──────────────────────── MODAL: SET BUDGET ──────────────────────── */}
      <AnimatePresence>
        {budgetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100"
            >
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-base text-gray-900 font-['Fredoka']">
                  {budgetTargetCat ? `Budget: ${budgetTargetCat.name}` : 'Overall Monthly Budget'}
                </h3>
                <button
                  type="button"
                  onClick={() => setBudgetModalOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveBudget} className="p-5 space-y-4">
                <p className="text-xs text-gray-500">
                  Effective from this month ({today.slice(0, 7)}) onward. Past months will retain their historical budget limit.
                </p>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Monthly Limit ({currency || 'USD'})
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="0"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    className="w-full text-2xl font-bold font-mono p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setBudgetModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    Save Budget
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ──────────────────────── MODAL: ONE-TIME CURRENCY PICKER ──────────────────────── */}
      <AnimatePresence>
        {currencyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 p-6 space-y-5"
            >
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-xl font-bold">
                  $
                </div>
                <h3 className="font-bold text-lg text-gray-900 font-['Fredoka']">
                  Choose Your Currency
                </h3>
                <p className="text-xs text-gray-500">
                  Select your primary currency for Lifestyle & Money tracking. You can always change this in Settings.
                </p>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                  {COMMON_CURRENCIES.map((curr) => (
                    <button
                      key={curr.code}
                      type="button"
                      onClick={() => {
                        setSelectedCurrencyCode(curr.code);
                        setCustomCurrency('');
                      }}
                      className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                        selectedCurrencyCode === curr.code && !customCurrency
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold ring-1 ring-emerald-500'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-mono font-bold block">{curr.code}</span>
                      <span className="text-[10px] text-gray-500 truncate block">{curr.name}</span>
                    </button>
                  ))}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Or custom ISO code:
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="e.g. SEK, NZD"
                    value={customCurrency}
                    onChange={(e) => setCustomCurrency(e.target.value.toUpperCase())}
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveCurrency}
                className="w-full py-3 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all cursor-pointer font-['Fredoka']"
              >
                Continue to Money
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
