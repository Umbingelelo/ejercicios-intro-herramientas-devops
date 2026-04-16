import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TareasService, Tarea } from './services/tareas.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <h1>📋 Mis Tareas DevOps</h1>

      <div class="form-row">
        <input type="text"
               [(ngModel)]="nuevoTitulo"
               (keyup.enter)="crear()"
               placeholder="Escribe una nueva tarea..." />
        <button (click)="crear()">Agregar</button>
      </div>

      <ul class="tareas">
        <li *ngFor="let t of tareas" [class.completada]="t.completada">
          <input type="checkbox"
                 [checked]="t.completada"
                 (change)="alternar(t)" />
          <span class="titulo">{{ t.titulo }}</span>
          <span class="estado">#{{ t.id }}</span>
          <button class="danger" (click)="eliminar(t)">Eliminar</button>
        </li>
      </ul>

      <footer>
        Backend: <code>{{ apiUrl }}</code>
      </footer>
    </div>
  `
})
export class AppComponent implements OnInit {
  private api = inject(TareasService);

  tareas: Tarea[] = [];
  nuevoTitulo = '';
  apiUrl = this.api.baseUrl;

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.listar().subscribe({
      next: (data) => (this.tareas = data),
      error: (err) => console.error('Error cargando tareas', err)
    });
  }

  crear(): void {
    const titulo = this.nuevoTitulo.trim();
    if (!titulo) return;
    this.api.crear(titulo).subscribe((t) => {
      this.tareas.push(t);
      this.nuevoTitulo = '';
    });
  }

  alternar(t: Tarea): void {
    this.api.actualizar(t.id, { completada: !t.completada })
      .subscribe((upd) => (t.completada = upd.completada));
  }

  eliminar(t: Tarea): void {
    this.api.eliminar(t.id).subscribe(() => {
      this.tareas = this.tareas.filter((x) => x.id !== t.id);
    });
  }
}
