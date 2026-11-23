use axum::{http::StatusCode, response::IntoResponse, routing::get, Router};
use tower_http::services::ServeDir;

// 1. El cocinero que entrega el catálogo de 161 obras en formato JSON
async fn obtener_catalogo() -> impl IntoResponse {
    match tokio::fs::read_to_string("public/catalogo/catalogo.json").await {
        Ok(contenido) => (
            StatusCode::OK,
            [("content-type", "application/json; charset=utf-8")],
            contenido,
        ).into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            [("content-type", "text/plain; charset=utf-8")],
            "No se encontró el archivo catalogo.json".to_string(),
        ).into_response(),
    }
}

// 2. La puerta principal potenciada por Tokio
#[tokio::main]
async fn main() {
    // Armamos el menú:
    // - Si piden "/api/catalogo", entregamos la base de datos JSON
    // - Para todo lo demás (la portada, las imágenes, estilos), busca en "public"
    let app = Router::new()
        .route("/api/catalogo", get(obtener_catalogo))
        .fallback_service(ServeDir::new("public"));

    // Abrimos la antena en la ventanilla 3000
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Servidor escuchando en la ventanilla 3000 (http://localhost:3000)...");

    // Ponemos a funcionar el negocio
    axum::serve(listener, app).await.unwrap();
}
