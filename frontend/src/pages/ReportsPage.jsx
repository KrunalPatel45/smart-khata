import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, RefreshCw, TrendingDown, TrendingUp, Wallet, ReceiptText } from 'lucide-react';
import api from '../api/client';

const localDate = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const part = (key) => parts.find((item) => item.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const today = () => localDate(new Date());
const monthStart = () => today().slice(0, 7) + '-01';
const currency = (value) => '₹' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReportsPage({ language = 'gu' }) {
  const gu = language === 'gu';
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (signal) => {
    if (!from || !to || from > to) {
      setError(gu ? 'યોગ્ય તારીખ પસંદ કરો.' : 'Select a valid date range.');
      return;
    }
    setLoading(true); setError('');
    try {
      const response = await api.get('/api/v1/reports/summary', { params: { from, to }, signal });
      setReport(response.data);
    } catch (err) {
      if (err.code !== 'ERR_CANCELED') {
        setError(err.response?.data?.message || (gu ? 'રિપોર્ટ લોડ થઈ શક્યો નથી.' : 'Unable to load report.'));
        setReport(null);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [from, to, gu]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function changePreset(value) {
    setPreset(value);
    const now = today();
    if (value === 'today') { setFrom(now); setTo(now); }
    if (value === 'month') { setFrom(monthStart()); setTo(now); }
  }

  const summary = report?.summary;
  const cards = [
    { label: gu ? 'આ સમયગાળાનું ઉધાર' : 'Period debit', value: summary?.total_debit, icon: TrendingUp, color: 'text-red-600' },
    { label: gu ? 'આ સમયગાળાની જમા' : 'Period credit', value: summary?.total_credit, icon: TrendingDown, color: 'text-green-600' },
    { label: gu ? 'નેટ ફેરફાર' : 'Net change', value: summary?.net_change, icon: Wallet, color: 'text-blue-600' },
    { label: gu ? 'કુલ એન્ટ્રી' : 'Transactions', value: summary?.transaction_count, icon: ReceiptText, color: 'text-slate-700', count: true },
  ];

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div><h1 className="text-2xl font-bold">{gu ? 'હિસાબ રિપોર્ટ' : 'Reports'}</h1><p className="text-sm text-slate-500">{gu ? 'દિવસ અને મહિના પ્રમાણે હિસાબ' : 'Daily and monthly ledger summary'}</p></div>
        <button type="button" onClick={() => load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-3 disabled:opacity-50"><RefreshCw size={17} />{gu ? 'રિફ્રેશ' : 'Refresh'}</button>
      </div>
      <section className="bg-white border rounded-2xl p-4 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {[['today', gu ? 'આજે' : 'Today'], ['month', gu ? 'ચાલુ મહિનો' : 'Current month'], ['custom', gu ? 'તારીખ પ્રમાણે' : 'Custom dates']].map(([key, label]) => (
            <button type="button" key={key} onClick={() => changePreset(key)} className={'rounded-xl px-4 py-2.5 text-sm font-semibold ' + (preset === key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700')}>{label}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-sm font-medium">{gu ? 'શરૂઆતની તારીખ' : 'From date'}<input type="date" value={from} onChange={(e) => { setPreset('custom'); setFrom(e.target.value); }} className="mt-1 block w-full min-w-0 rounded-xl border p-3 bg-white" /></label>
          <label className="block text-sm font-medium">{gu ? 'અંતિમ તારીખ' : 'To date'}<input type="date" value={to} onChange={(e) => { setPreset('custom'); setTo(e.target.value); }} className="mt-1 block w-full min-w-0 rounded-xl border p-3 bg-white" /></label>
        </div>
        <p className="text-xs text-slate-500 flex gap-2 items-center"><CalendarDays size={15}/>{gu ? 'બધી તારીખો ભારતના સમય પ્રમાણે છે.' : 'Dates use India Standard Time.'}</p>
      </section>
      {error && <p role="alert" className="bg-red-50 text-red-700 p-4 rounded-xl">{error}</p>}
      {loading && <p role="status" className="text-slate-500">{gu ? 'રિપોર્ટ લોડ થાય છે...' : 'Loading report...'}</p>}
      {summary && <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map(({ label, value, icon: Icon, color, count }) => (
            <div key={label} className="bg-white border rounded-2xl p-3 sm:p-5 min-w-0"><Icon size={22} className={color}/><p className="text-xs sm:text-sm text-slate-500 mt-3">{label}</p><p className={'text-lg sm:text-2xl font-bold mt-1 break-words ' + color}>{count ? value ?? 0 : currency(value)}</p></div>
          ))}
        </div>
        <div className="rounded-2xl border bg-blue-50 p-4 flex flex-wrap justify-between gap-2 items-center"><span className="font-medium">{gu ? 'અત્યાર સુધીની કુલ બાકી' : 'Overall outstanding (all time)'}</span><strong className="text-xl text-blue-800">{currency(summary.overall_outstanding)}</strong></div>
        <section className="bg-white border rounded-2xl overflow-hidden"><h2 className="p-4 border-b font-bold">{gu ? 'દિવસ પ્રમાણે રિપોર્ટ' : 'Daily report'}</h2>
          {report.daily?.length ? <div className="divide-y">{report.daily.map((row) => <div key={row.date} className="p-4 space-y-2"><div className="flex justify-between gap-2 font-semibold"><span>{row.date}</span><span className="text-sm text-slate-500">{row.transaction_count} {gu ? 'એન્ટ્રી' : 'entries'}</span></div><div className="grid grid-cols-3 gap-2 text-xs sm:text-sm"><div><p className="text-slate-500">{gu ? 'ઉધાર' : 'Debit'}</p><p className="font-semibold text-red-600 break-all">{currency(row.debit)}</p></div><div><p className="text-slate-500">{gu ? 'જમા' : 'Credit'}</p><p className="font-semibold text-green-600 break-all">{currency(row.credit)}</p></div><div><p className="text-slate-500">{gu ? 'નેટ' : 'Net'}</p><p className="font-semibold break-all">{currency(row.net_change)}</p></div></div></div>)}</div> : <p className="p-5 text-slate-500">{gu ? 'આ તારીખોમાં કોઈ એન્ટ્રી નથી.' : 'No transactions in this period.'}</p>}
        </section>
        <section className="bg-white border rounded-2xl overflow-hidden"><h2 className="p-4 border-b font-bold">{gu ? 'મહિના પ્રમાણે રિપોર્ટ' : 'Monthly report'}</h2>
          {report.monthly?.length ? <div className="divide-y">{report.monthly.map((row) => <div key={row.month} className="p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{row.month}</p><p className="text-xs text-slate-500">{row.transaction_count} {gu ? 'એન્ટ્રી' : 'entries'}</p></div><div className="text-right text-sm"><p className="text-red-600">{gu ? 'ઉધાર' : 'Debit'}: {currency(row.debit)}</p><p className="text-green-600">{gu ? 'જમા' : 'Credit'}: {currency(row.credit)}</p><p className="font-semibold">{gu ? 'નેટ' : 'Net'}: {currency(row.net_change)}</p></div></div>)}</div> : <p className="p-5 text-slate-500">{gu ? 'માસિક માહિતી નથી.' : 'No monthly data.'}</p>}
        </section>
      </>}
    </div>
  );
}
