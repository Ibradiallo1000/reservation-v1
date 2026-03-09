import { useAuth } from "@/contexts/AuthContext";

export default function DebugAuthPage() {
  const { user, loading, company } = useAuth() as any;

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">🔍 Debug Auth - Diagnostics</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-lg font-semibold mb-4 text-blue-700">👤 Informations Utilisateur</h2>
          <div className="space-y-3">
            <div>
              <strong className="text-gray-700">État du chargement:</strong>
              <span className={`ml-2 px-2 py-1 rounded text-sm ${loading ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}>
                {loading ? "En cours..." : "Terminé"}
              </span>
            </div>
            <div>
              <strong className="text-gray-700">Utilisateur connecté:</strong>
              <span className={`ml-2 px-2 py-1 rounded text-sm ${user ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                {user ? "Oui" : "Non"}
              </span>
            </div>
            {user && (
              <>
                <div>
                  <strong className="text-gray-700">Email:</strong>
                  <span className="ml-2 text-gray-900">{user.email}</span>
                </div>
                <div>
                  <strong className="text-gray-700">Nom:</strong>
                  <span className="ml-2 text-gray-900">{user.nom || "Non défini"}</span>
                </div>
                <div>
                  <strong className="text-gray-700">Rôle (brut):</strong>
                  <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-sm font-mono">{user.role || "Non défini"}</code>
                </div>
                <div>
                  <strong className="text-gray-700">ID Compagnie:</strong>
                  <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-sm font-mono">{user.companyId || "Non défini"}</code>
                </div>
                <div>
                  <strong className="text-gray-700">ID Agence:</strong>
                  <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-sm font-mono">{user.agencyId || "Non défini"}</code>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-lg font-semibold mb-4 text-green-700">🏢 Informations Compagnie</h2>
          <div className="space-y-3">
            {company ? (
              <>
                <div>
                  <strong className="text-gray-700">Nom Compagnie:</strong>
                  <span className="ml-2 text-gray-900">{company.nom || "Non défini"}</span>
                </div>
                <div>
                  <strong className="text-gray-700">ID:</strong>
                  <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-sm font-mono">{company.id}</code>
                </div>
                <div>
                  <strong className="text-gray-700">Slug:</strong>
                  <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-sm font-mono">{company.slug || "Non défini"}</code>
                </div>
                <div>
                  <strong className="text-gray-700">Plan:</strong>
                  <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm">{company.plan || "Non défini"}</span>
                </div>
              </>
            ) : (
              <div className="text-gray-500 italic">
                {user?.companyId ? "Chargement de la compagnie..." : "Aucune compagnie associée"}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-lg font-semibold mb-4 text-red-700">🧪 Tests de Navigation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <a href={user?.companyId ? `/compagnie/${user.companyId}/accounting` : "/role-landing"} className="block p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition text-center">
              <div className="font-medium text-blue-800">/compagnie/:companyId/accounting</div>
              <div className="text-sm text-blue-600 mt-1">Espace Chef Comptable Compagnie</div>
              <div className="text-xs text-blue-500 mt-2">Rôles: company_accountant, financial_director</div>
            </a>
            <a href="/agence/comptabilite" className="block p-4 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition text-center">
              <div className="font-medium text-green-800">/agence/comptabilite</div>
              <div className="text-sm text-green-600 mt-1">Espace Comptable Agence</div>
              <div className="text-xs text-green-500 mt-2">Rôle: agency_accountant</div>
            </a>
            <a href="/compagnie/dashboard" className="block p-4 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition text-center">
              <div className="font-medium text-purple-800">/compagnie/dashboard</div>
              <div className="text-sm text-purple-600 mt-1">Espace CEO Compagnie</div>
              <div className="text-xs text-purple-500 mt-2">Rôle: admin_compagnie</div>
            </a>
            <a href="/admin/dashboard" className="block p-4 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition text-center">
              <div className="font-medium text-orange-800">/admin/dashboard</div>
              <div className="text-sm text-orange-600 mt-1">Espace Admin Plateforme</div>
              <div className="text-xs text-blue-500 mt-2">Rôle: admin_platforme</div>
            </a>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">📊 Données Brutes (JSON)</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium mb-2 text-gray-600">Utilisateur:</h3>
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-60">
                {JSON.stringify(user, null, 2) || "Aucun utilisateur"}
              </pre>
            </div>
            <div>
              <h3 className="font-medium mb-2 text-gray-600">Compagnie:</h3>
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-60">
                {JSON.stringify(company, null, 2) || "Aucune compagnie"}
              </pre>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="font-semibold text-yellow-800 mb-2">📝 Instructions de débogage:</h3>
        <ul className="list-disc pl-5 text-yellow-700 space-y-1">
          <li>Ouvrez la console du navigateur (F12) pour voir les logs détaillés</li>
          <li>Vérifiez que le rôle de l&apos;utilisateur dans Firestore correspond à ceux autorisés</li>
          <li>Testez les différents liens de navigation pour voir où vous êtes redirigé</li>
          <li>Si bloqué, vérifiez les logs de PrivateRoute dans la console</li>
        </ul>
      </div>
    </div>
  );
}
