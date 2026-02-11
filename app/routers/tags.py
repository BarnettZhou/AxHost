from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import User
from app.routers.auth import get_current_user
from app.schemas.schemas import TagCreate, TagUpdate
from app.services.services import TagService

router = APIRouter(prefix="/api/tags", tags=["标签管理"])


def _serialize_tag(tag, current_user: User):
    can_edit = current_user.role == "admin" or tag.creator_id == current_user.id
    return {
        "id": tag.id,
        "name": tag.name,
        "emoji": tag.emoji,
        "color": tag.color,
        "creator_id": tag.creator_id,
        "created_at": tag.created_at,
        "can_edit": can_edit,
    }


@router.get("")
def list_tags(
    search: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tags = TagService.list_all(db, search=search)
    return [_serialize_tag(tag, current_user) for tag in tags]


@router.post("")
def create_tag(
    data: TagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        tag = TagService.create(db, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _serialize_tag(tag, current_user)


@router.put("/{tag_id}")
def update_tag(
    tag_id: int,
    data: TagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tag = TagService.get_by_id(db, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    if current_user.role != "admin" and tag.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="仅标签创建者或管理员可编辑")
    try:
        updated = TagService.update(db, tag, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _serialize_tag(updated, current_user)


@router.get("/common")
def list_common_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tags = TagService.list_common_tags(db, current_user.id)
    return [_serialize_tag(tag, current_user) for tag in tags]


@router.post("/common/{tag_id}")
def add_common_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tag = TagService.get_by_id(db, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    TagService.add_common_tag(db, current_user.id, tag_id)
    return {"message": "已加入常用标签"}


@router.delete("/common/{tag_id}")
def remove_common_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    TagService.remove_common_tag(db, current_user.id, tag_id)
    return {"message": "已从常用标签移除"}
