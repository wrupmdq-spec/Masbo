import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Error no controlado en la aplicación:", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
          <div className="max-w-sm text-center bg-white border border-stone-200 rounded-2xl p-6">
            <h2 className="font-semibold text-stone-800 mb-2">Algo ha ido mal</h2>
            <p className="text-sm text-stone-500 mb-4">
              Ha ocurrido un error inesperado. Tus datos están a salvo — recarga la página para continuar.
            </p>
            <button
              onClick={this.handleReload}
              className="bg-[#806c4d] hover:bg-[#6d5c42] text-white font-medium rounded-xl text-sm px-4 py-2.5"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

