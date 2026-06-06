export const createClient = () => {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          neq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null })
            })
          })
        })
      })
    })
  };
};
