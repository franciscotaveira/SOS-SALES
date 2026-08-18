import React, { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<GlobalErrorBoundaryProps, GlobalErrorBoundaryState> {
  state: GlobalErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Critical Runtime Error in SOS Sales:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0B132B',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            backgroundColor: '#1E293B',
            borderRadius: '16px',
            border: '1px solid #334155',
            padding: '32px',
            maxWidth: '480px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#001f18',
              border: '1px solid #00a884',
              color: '#00a884',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '18px',
              margin: '0 auto 16px auto'
            }}>
              SOS
            </div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: '#F8FAFC' }}>
              SOS Sales Recuperado com Sucesso
            </h1>
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              Detectamos uma oscilação temporária na interface. Clique abaixo para restabelecer o cockpit.
            </p>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('sos_active_tab');
                window.location.href = '/agora';
              }}
              style={{
                backgroundColor: '#00A884',
                color: '#ffffff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              Reiniciar Cockpit de Vendas
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
);
