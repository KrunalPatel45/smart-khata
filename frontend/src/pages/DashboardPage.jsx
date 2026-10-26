import { useEffect, useState } from 'react';
import {
  Users,
  Mic,
  Wallet,
  CalendarDays,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import VoiceEntryPage from './VoiceEntryPage';

export default function DashboardPage({ language = 'gu' }) {
  const [count, setCount] = useState(null);
  const [showVoiceEntry, setShowVoiceEntry] = useState(false);

  const gu = language === 'gu';

  useEffect(() => {
    let active = true;

    api.get('/api/v1/customers', {
      params: { per_page: 1 },
    })
      .then(({ data }) => {
        if (active) {
          setCount(data.data.total);
        }
      })
      .catch(() => {
        if (active) {
          setCount(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const openVoiceEntry = () => {
    setShowVoiceEntry(true);
  };

  const closeVoiceEntry = () => {
    setShowVoiceEntry(false);
  };

  return (
    <div className="space-y-6">

      <h1 className="text-2xl font-bold">
        {gu ? 'ડેશબોર્ડ' : 'Dashboard'}
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        <Link
          to="/customers"
          className="bg-white border rounded-2xl p-6 shadow-sm"
        >
          <Users className="text-blue-600" />

          <p className="text-slate-500 mt-4">
            {gu ? 'કુલ ગ્રાહકો' : 'Total Customers'}
          </p>

          <p className="text-3xl font-bold mt-2">
            {count ?? '—'}
          </p>
        </Link>

        <div className="bg-white border rounded-2xl p-6">
          <Wallet className="text-green-600" />

          <p className="text-slate-500 mt-4">
            {gu ? 'કુલ બાકી' : 'Total Outstanding'}
          </p>

          <p className="text-2xl font-bold mt-2">
            —
          </p>
        </div>

        <div className="bg-white border rounded-2xl p-6">
          <CalendarDays className="text-purple-600" />

          <p className="text-slate-500 mt-4">
            {gu ? 'આજની વસૂલાત' : 'Today Collection'}
          </p>

          <p className="text-2xl font-bold mt-2">
            —
          </p>
        </div>

      </div>

      <section className="bg-white border rounded-2xl p-6 md:p-8">

        {!showVoiceEntry ? (
          <div className="text-center">

            <Mic
              size={44}
              className="text-blue-600 mx-auto"
            />

            <h2 className="text-xl font-bold mt-4">
              {gu ? 'વૉઇસ એન્ટ્રી' : 'Voice Entry'}
            </h2>

            <p className="text-slate-500 mt-2">
              {gu
                ? 'વૉઇસ દ્વારા ઉધાર અને જમા એન્ટ્રી કરો.'
                : 'Create debit and credit entries using your voice.'}
            </p>

            <button
              type="button"
              onClick={openVoiceEntry}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl mt-5 transition-colors"
            >
              <Mic size={18} />

              {gu
                ? 'બોલવાનું શરૂ કરો'
                : 'Start Speaking'}
            </button>

          </div>
        ) : (
          <div className="space-y-5">

            <div className="flex items-center justify-between gap-3 border-b pb-4">

              <div className="flex items-center gap-3">
                <Mic
                  size={25}
                  className="text-blue-600"
                />

                <h2 className="text-xl font-bold">
                  {gu
                    ? 'વૉઇસ દ્વારા એન્ટ્રી'
                    : 'Voice Transaction Entry'}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeVoiceEntry}
                className="flex items-center gap-2 border border-slate-300 rounded-xl px-3 py-2 hover:bg-slate-100"
                aria-label="Close voice entry"
              >
                <X size={18} />

                <span className="hidden sm:inline">
                  {gu ? 'બંધ કરો' : 'Close'}
                </span>
              </button>

            </div>

            <VoiceEntryPage language={language} />

          </div>
        )}

      </section>

    </div>
  );
}