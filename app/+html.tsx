import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Asegura html/body/#root con altura completa en web (sin esto la UI puede verse “en blanco”).
 * ScrollViewStyleReset pone #root{display:flex} pero en CSS el eje por defecto es **fila**;
 * sin flex-direction:column el árbol de RN no reparte altura y las escenas quedan en 0px.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="theme-color" content="#6DC921" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Del Centro" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/assets/icon.png" />
        <ScrollViewStyleReset />
        <style
          id="delcentro-root-flex"
          dangerouslySetInnerHTML={{
            __html: `
html{height:100%;display:flex;flex-direction:column}
body{flex:1;display:flex;flex-direction:column;margin:0;min-height:100vh}
#root{flex:1;display:flex;flex-direction:column;min-height:0;width:100%;min-height:100vh;box-sizing:border-box}
/* Primer envoltorio de react-native-web: sin esto el árbol a veces no estira y las escenas quedan en blanco */
#root>div{flex:1;display:flex;flex-direction:column;min-height:100vh;width:100%;box-sizing:border-box}
`.replace(/\s+/g, ''),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
