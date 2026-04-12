export default function StatusPill({ status }: { status: string }) {
  let color = "bg-gray-400";

  if (status === "healthy") color = "bg-green-500";
  if (status === "stress") color = "bg-yellow-500";
  if (status === "disease") color = "bg-red-500";
  if (status === "offline") color = "bg-gray-500";

  return (
    <span className={`px-2 py-1 text-white rounded ${color}`}>
      {status}
    </span>
  );
}