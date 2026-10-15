import { Redirect } from "expo-router";
import { useApp } from "../state";
import { AccountLoading } from "../AccountScreen";
export default function Index() {
  const { user, restoring } = useApp();
  if (restoring) return <AccountLoading />;
  return (
    <Redirect
      href={
        !user ? "/login" : user.accountType === "owner" ? "/workspace" : "/home"
      }
    />
  );
}
