/**
 * pattern для обов'язкових текстових полів (реквізити наказу): HTML required пропускає рядок із
 * самих пробілів, а сервер перевіряє minLength до trim() — тож вимагаємо хоч один непробільний символ.
 */
export const NON_BLANK = '.*\\S.*';

/** Форма змінена відносно початкових значень (плоскі об'єкти й масиви). */
export const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
