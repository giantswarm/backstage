export const appendQueryParams = (url: string, source?: string, category?: string) => {
    const params = new URLSearchParams();
    if (source) {
        params.append('source', source);
    }
    if (category) {
        params.append('category', category);
    }
    const queryString = params.toString();

    return queryString ? `${url}?${queryString}` : url;
}