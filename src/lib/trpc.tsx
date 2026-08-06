'use client';

import { createTRPCReact } from '@trpc/react-query';
import { type AppRouter } from '@/server/trpc/router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import React, { useState } from 'react';
import superjson from 'superjson';

export const trpc = createTRPCReact<AppRouter>();

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // Data stays fresh for 1 minute (instant tab switching, zero network delay)
        gcTime: 10 * 60 * 1000, // Keep unused cache for 10 minutes
        refetchOnWindowFocus: false,
        refetchOnMount: false, // Don't refetch on component remount if data is fresh
      },
    },
  }));
  
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          transformer: superjson,
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
