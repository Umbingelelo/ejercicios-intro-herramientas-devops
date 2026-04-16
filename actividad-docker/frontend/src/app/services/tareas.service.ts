import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Tarea {
  id: number;
  titulo: string;
  completada: boolean;
}

@Injectable({ providedIn: 'root' })
export class TareasService {
  private http = inject(HttpClient);

  // Importante: usamos localhost porque el NAVEGADOR del estudiante
  // es quien hace la peticion (no el contenedor del frontend).
  // Por eso redirigimos al puerto publicado por el backend en el host.
  readonly baseUrl = 'http://localhost:3000';

  listar(): Observable<Tarea[]> {
    return this.http.get<Tarea[]>(`${this.baseUrl}/api/tareas`);
  }

  crear(titulo: string): Observable<Tarea> {
    return this.http.post<Tarea>(`${this.baseUrl}/api/tareas`, { titulo });
  }

  actualizar(id: number, cambios: Partial<Tarea>): Observable<Tarea> {
    return this.http.patch<Tarea>(`${this.baseUrl}/api/tareas/${id}`, cambios);
  }

  eliminar(id: number): Observable<Tarea> {
    return this.http.delete<Tarea>(`${this.baseUrl}/api/tareas/${id}`);
  }
}
