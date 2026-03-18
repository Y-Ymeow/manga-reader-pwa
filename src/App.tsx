import { Router } from './routes';
import { CfChallengeModal, useCfChallenge } from './components/CfChallengeModal';
import { PluginUIComponents } from './components/plugin-ui/provider';

function AppContent() {
  const [challengeUrl, closeChallenge] = useCfChallenge();

  return (
    <>
      <Router />
      <CfChallengeModal challengeUrl={challengeUrl} onClose={closeChallenge} />
      <PluginUIComponents />
    </>
  );
}

export function App() {
  return (
    <div class="h-screen flex flex-col bg-[#1a1a2e] text-white overflow-hidden">
      <AppContent />
    </div>
  );
}
