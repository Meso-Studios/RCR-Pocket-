import React from 'react';

interface State {
  error: unknown;
}

export class RebootErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Rhythm Canvas Reboot error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[100dvh] bg-[#090a10] text-white p-6 md:p-10 font-sans overflow-y-auto">
          <h1 className="text-3xl md:text-5xl font-black text-[#ffd21b]">REBOOT RECOVERY</h1>
          <p className="mt-2 text-gray-300">The game recovered from a loading error.</p>
          <pre className="mt-4 whitespace-pre-wrap bg-[#151720] p-4 border-2 border-red-500 text-sm overflow-x-auto">
            {String((this.state.error as any)?.message || this.state.error)}
          </pre>
          <button
            onClick={() => {
              localStorage.removeItem('rhythmCanvasLocalSongs');
              window.location.reload();
            }}
            className="mt-4 px-6 py-3 bg-pink-500 text-white font-black border-2 border-white"
          >
            CLEAR DAMAGED LOCAL TRACKS & RELOAD
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
