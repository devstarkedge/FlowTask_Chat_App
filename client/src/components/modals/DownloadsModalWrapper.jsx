import DownloadsModal from "./DownloadsModal";
import { useUIStore } from "../../stores/uiStore";

export default function DownloadsModalWrapper() {
  const isDownloadsOpen = useUIStore((s) => s.isDownloadsOpen);
  const closeDownloads = useUIStore((s) => s.closeDownloads);

  console.log("MODAL STATE:", isDownloadsOpen); 

  return (
    <DownloadsModal
      isOpen={isDownloadsOpen}
      onClose={closeDownloads}
    //   channelId={channelId}
    />
  );
}