import { AuthenticatedProviders } from "~/components/authenticated-providers";
import { GuestLayout } from "~/components/layout/guest-layout";
import { AuthenticatedLayout } from "~/components/layout/main-layout";
import { StructuredData } from "~/components/seo/structured-data";
import { auth } from "~/server/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <>
      <StructuredData />
      {session?.user ? (
        <AuthenticatedProviders>
          <AuthenticatedLayout />
        </AuthenticatedProviders>
      ) : (
        <GuestLayout />
      )}
    </>
  );
}
