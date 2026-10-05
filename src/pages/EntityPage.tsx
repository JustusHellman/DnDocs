import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import EntityView from '../components/entity/EntityView';
import { Page } from '../components/ui/bits';
import { usePeek } from '../contexts/PeekContext';

export default function EntityPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeId, close } = usePeek();

  // No point showing the same entry twice.
  useEffect(() => {
    if (activeId === id) close();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/search');
  };

  return (
    <Page wide>
      <button type="button" onClick={back} className="btn btn-ghost btn-sm mb-3 -ml-2 text-stone-400">
        <ArrowLeft size={16} /> Back
      </button>
      <EntityView entityId={id} />
    </Page>
  );
}
